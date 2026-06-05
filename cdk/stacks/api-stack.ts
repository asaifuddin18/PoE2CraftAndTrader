import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { HttpApi, HttpMethod, CorsHttpMethod } from "aws-cdk-lib/aws-apigatewayv2";
import { HttpLambdaIntegration } from "aws-cdk-lib/aws-apigatewayv2-integrations";
import { HttpLambdaAuthorizer, HttpLambdaResponseType } from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import type { StorageStack } from "./storage-stack";

interface ApiStackProps extends cdk.StackProps {
  env_name: string;
  storageStack: StorageStack;
  corsOrigin?: string; // e.g. https://po-e2-craft-and-trader.vercel.app ("*" if omitted)
}

const FUNCTIONS = path.join(__dirname, "..", "packages", "functions");

export class ApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { env_name, storageStack, corsOrigin } = props;
    const table = storageStack.table;

    // ── Scratch bucket: {pool,prices,target} handoff between SFN states ─────────
    const scratch = new s3.Bucket(this, "ScratchBucket", {
      bucketName: `poe2-craft-scratch-${env_name}-${this.account}`,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [{ expiration: cdk.Duration.days(1) }],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // ── Shared auth secret (must equal the Vercel app's AUTH_SECRET) ────────────
    // The actual value is populated out-of-band by the deploy workflow
    // (`aws secretsmanager put-secret-value`) from the GitHub `AUTH_SECRET`
    // secret, so it stays out of the CloudFormation template and survives
    // redeploys. CDK only owns the resource, not its value.
    const authSecret = new secretsmanager.Secret(this, "CraftAuthSecret", {
      secretName: `poe2-craft-auth-${env_name}`,
      description: "HS256 signing secret shared with the Next.js /api/craft/token route. Must equal Vercel AUTH_SECRET.",
    });

    // ── Lambda factory ─────────────────────────────────────────────────────────
    const commonEnv = { DYNAMODB_TABLE: table.tableName, SCRATCH_BUCKET: scratch.bucketName };
    const makeFn = (name: string, dir: string, opts: Partial<lambda.FunctionProps> & { env?: Record<string, string> } = {}) =>
      new NodejsFunction(this, name, {
        functionName: `poe2-${dir}-${env_name}`,
        runtime: lambda.Runtime.NODEJS_22_X,
        entry: path.join(FUNCTIONS, dir, "index.ts"),
        handler: "handler",
        memorySize: opts.memorySize ?? 1024,
        timeout: opts.timeout ?? cdk.Duration.seconds(30),
        environment: { ...commonEnv, ...(opts.env ?? {}) },
        bundling: { minify: true, sourceMap: true, target: "node22" },
        logRetention: logs.RetentionDays.TWO_WEEKS,
      });

    const prepareFn   = makeFn("PrepareFn",   "craft-prepare",   { memorySize: 1024, timeout: cdk.Duration.seconds(20) });
    const workerFn    = makeFn("WorkerFn",    "craft-worker",    { memorySize: 1769, timeout: cdk.Duration.seconds(30) });
    const aggregateFn = makeFn("AggregateFn", "craft-aggregate", { memorySize: 1769, timeout: cdk.Duration.seconds(30) });

    // Grant data access
    table.grantReadData(prepareFn);
    table.grantReadData(aggregateFn);
    scratch.grantReadWrite(prepareFn);
    scratch.grantRead(workerFn);
    scratch.grantReadWrite(aggregateFn); // read for refinement + delete

    // ── Step Functions Express workflow: Prepare → Choice → Map(Worker) → Aggregate
    const prepareTask = new tasks.LambdaInvoke(this, "Prepare", {
      lambdaFunction: prepareFn,
      payloadResponseOnly: true,
      resultPath: "$.prep",
    });

    const workerTask = new tasks.LambdaInvoke(this, "Worker", {
      lambdaFunction: workerFn,
      payloadResponseOnly: true,
    });

    const mapState = new sfn.Map(this, "Fanout", {
      itemsPath: "$.prep.jobs",
      itemSelector: {
        scratchKey: sfn.JsonPath.stringAt("$.prep.scratchKey"),
        job: sfn.JsonPath.objectAt("$$.Map.Item.Value"),
      },
      maxConcurrency: 20,
      resultPath: "$.results",
    });
    mapState.itemProcessor(workerTask);

    const aggregateTask = new tasks.LambdaInvoke(this, "Aggregate", {
      lambdaFunction: aggregateFn,
      payloadResponseOnly: true,
      payload: sfn.TaskInput.fromObject({
        scratchKey: sfn.JsonPath.stringAt("$.prep.scratchKey"),
        results: sfn.JsonPath.objectAt("$.results"),
        jobs: sfn.JsonPath.objectAt("$.prep.jobs"),
        startedAt: sfn.JsonPath.numberAt("$.startedAt"),
      }),
    });

    const infeasible = new sfn.Pass(this, "Infeasible", {
      parameters: {
        feasible: false,
        error: sfn.JsonPath.stringAt("$.prep.error"),
        best_pattern: null,
        all_patterns: [],
        elapsed_ms: 0,
      },
    });

    const definition = prepareTask.next(
      new sfn.Choice(this, "Feasible?")
        .when(sfn.Condition.booleanEquals("$.prep.feasible", true), mapState.next(aggregateTask))
        .otherwise(infeasible),
    );

    // Standard (not Express) so the frontend can poll DescribeExecution and the
    // run is not bound by API Gateway's 30s synchronous ceiling.
    // No explicit stateMachineName: a fixed name blocks the Express→Standard
    // replacement (CFN can't create a same-named replacement before deleting
    // the old one). Let CDK auto-name it; consumers use the ARN token.
    const stateMachine = new sfn.StateMachine(this, "CraftSolver", {
      stateMachineType: sfn.StateMachineType.STANDARD,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.minutes(5),
    });

    // ── API Gateway (HTTP API) → entry Lambda (StartExecution, async) ───────────
    const entryFn = makeFn("EntryFn", "craft-entry", {
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      env: { STATE_MACHINE_ARN: stateMachine.stateMachineArn, CORS_ORIGIN: corsOrigin ?? "*" },
    });
    stateMachine.grantStartExecution(entryFn);

    // Status poller: DescribeExecution for a given executionArn.
    const statusFn = makeFn("StatusFn", "craft-status", {
      memorySize: 256,
      timeout: cdk.Duration.seconds(15),
      env: { CORS_ORIGIN: corsOrigin ?? "*" },
    });
    statusFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["states:DescribeExecution"],
      resources: [`${stateMachine.stateMachineArn.replace(":stateMachine:", ":execution:")}:*`],
    }));

    const authorizerFn = makeFn("AuthorizerFn", "craft-authorizer", {
      memorySize: 256,
      timeout: cdk.Duration.seconds(10),
      env: { AUTH_SECRET_ARN: authSecret.secretArn },
    });
    authSecret.grantRead(authorizerFn);

    const authorizer = new HttpLambdaAuthorizer("CraftAuthorizer", authorizerFn, {
      responseTypes: [HttpLambdaResponseType.SIMPLE],
      identitySource: ["$request.header.Authorization"],
      resultsCacheTtl: cdk.Duration.seconds(0),
    });

    const httpApi = new HttpApi(this, "CraftHttpApi", {
      apiName: `poe2-craft-api-${env_name}`,
      corsPreflight: {
        allowOrigins: [corsOrigin ?? "*"],
        allowMethods: [CorsHttpMethod.POST, CorsHttpMethod.GET, CorsHttpMethod.OPTIONS],
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    httpApi.addRoutes({
      path: "/solve",
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration("SolveIntegration", entryFn),
      authorizer,
    });

    httpApi.addRoutes({
      path: "/status",
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration("StatusIntegration", statusFn),
      authorizer,
    });

    // ── Outputs ────────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "CraftApiUrl", {
      value: httpApi.apiEndpoint,
      description: "Set Vercel env NEXT_PUBLIC_CRAFT_API_URL to this value",
      exportName: `poe2-craft-api-url-${env_name}`,
    });
    new cdk.CfnOutput(this, "AuthSecretName", {
      value: authSecret.secretName,
      description: "Deploy workflow puts the GitHub AUTH_SECRET value here; must match Vercel AUTH_SECRET",
    });
    new cdk.CfnOutput(this, "StateMachineArn", { value: stateMachine.stateMachineArn });
  }
}
