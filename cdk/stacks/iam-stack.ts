import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import type { StorageStack } from "./storage-stack";

interface IamStackProps extends cdk.StackProps {
  env_name: string;
  storageStack: StorageStack;
  githubOrg: string;    // e.g. "asaifuddin18"
  githubRepo: string;   // e.g. "PoE2CraftAndTrader"
  vercelTeamSlug: string; // e.g. "asaifuddin18" — from your Vercel team URL
  vercelProjectName: string; // e.g. "poe2-craft-and-trader"
}

export class IamStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: IamStackProps) {
    super(scope, id, props);

    const { env_name, storageStack, githubOrg, githubRepo, vercelTeamSlug, vercelProjectName } = props;
    const account = cdk.Stack.of(this).account;
    const region  = cdk.Stack.of(this).region;
    const cdkQualifier = "hnb659fds";

    // ── GitHub Actions OIDC ──────────────────────────────────────────────────

    // GitHub OIDC provider already exists in this account (created by CookBook).
    // Import it rather than creating a new one — one provider per account per URL.
    const githubOidc = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      "GitHubOidc",
      `arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    const githubDeployRole = new iam.Role(this, "GitHubActionsDeployRole", {
      roleName: `poe2-github-deploy-${env_name}`,
      description: "Assumed by GitHub Actions via OIDC for CDK deployments",
      assumedBy: new iam.WebIdentityPrincipal(githubOidc.openIdConnectProviderArn, {
        StringLike: {
          "token.actions.githubusercontent.com:sub":
            `repo:${githubOrg}/${githubRepo}:*`,
        },
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Allow the role to assume CDK bootstrap roles (all CDK deploy operations
    // flow through these roles — this keeps the GitHub role itself minimal)
    githubDeployRole.addToPolicy(new iam.PolicyStatement({
      sid: "AssumeCdkBootstrapRoles",
      effect: iam.Effect.ALLOW,
      actions: ["sts:AssumeRole"],
      resources: [
        `arn:aws:iam::${account}:role/cdk-${cdkQualifier}-deploy-role-${account}-${region}`,
        `arn:aws:iam::${account}:role/cdk-${cdkQualifier}-file-publishing-role-${account}-${region}`,
        `arn:aws:iam::${account}:role/cdk-${cdkQualifier}-image-publishing-role-${account}-${region}`,
        `arn:aws:iam::${account}:role/cdk-${cdkQualifier}-lookup-role-${account}-${region}`,
      ],
    }));

    githubDeployRole.addToPolicy(new iam.PolicyStatement({
      sid: "CloudFormationRead",
      effect: iam.Effect.ALLOW,
      actions: [
        "cloudformation:DescribeStacks",
        "cloudformation:DescribeStackEvents",
        "cloudformation:ListStacks",
      ],
      resources: ["*"],
    }));

    // ── Vercel OIDC ──────────────────────────────────────────────────────────
    // Vercel uses team-scoped OIDC: https://oidc.vercel.com/{teamSlug}
    // Thumbprint: SHA-1 of oidc.vercel.com's leaf certificate

    const vercelOidc = new iam.OpenIdConnectProvider(this, "VercelOidc", {
      url: `https://oidc.vercel.com/${vercelTeamSlug}`,
      clientIds: [`https://vercel.com/${vercelTeamSlug}`],
      thumbprints: ["48395b97c4768a655b91ebdccb0e680a70de97f7"],
    });

    const vercelAppRole = new iam.Role(this, "VercelAppRole", {
      roleName: `poe2-vercel-app-${env_name}`,
      description: "Assumed by Vercel functions via OIDC for DynamoDB access",
      assumedBy: new iam.WebIdentityPrincipal(vercelOidc.openIdConnectProviderArn, {
        StringEquals: {
          [`oidc.vercel.com/${vercelTeamSlug}:aud`]:
            `https://vercel.com/${vercelTeamSlug}`,
        },
        // Allow all environments (production + preview) for this project
        StringLike: {
          [`oidc.vercel.com/${vercelTeamSlug}:sub`]: [
            `owner:${vercelTeamSlug}:project:${vercelProjectName}:environment:production`,
            `owner:${vercelTeamSlug}:project:${vercelProjectName}:environment:preview`,
          ],
        },
      }),
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Scoped DynamoDB permissions — only our table
    vercelAppRole.addToPolicy(new iam.PolicyStatement({
      sid: "DynamoDBTableAccess",
      effect: iam.Effect.ALLOW,
      actions: [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem",
      ],
      resources: [
        storageStack.table.tableArn,
        `${storageStack.table.tableArn}/index/*`,
      ],
    }));

    // ── Outputs ───────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, "GitHubDeployRoleArn", {
      value: githubDeployRole.roleArn,
      description: "Add to GitHub Actions secrets as AWS_ROLE_ARN",
      exportName: `poe2-github-deploy-role-arn-${env_name}`,
    });

    new cdk.CfnOutput(this, "VercelAppRoleArn", {
      value: vercelAppRole.roleArn,
      description: "Add to Vercel project env vars as AWS_ROLE_ARN",
      exportName: `poe2-vercel-app-role-arn-${env_name}`,
    });

    new cdk.CfnOutput(this, "AwsRegion", {
      value: region,
      description: "Add to Vercel env vars as AWS_REGION",
    });

    new cdk.CfnOutput(this, "DynamoDBTable", {
      value: storageStack.table.tableName,
      description: "Add to Vercel env vars as DYNAMODB_TABLE",
    });
  }
}
