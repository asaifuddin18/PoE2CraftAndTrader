import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

interface StorageStackProps extends cdk.StackProps {
  env_name: string; // "dev" | "prod"
}

export class StorageStack extends cdk.Stack {
  /** The single application table — exported for ApiStack to grant access */
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { env_name } = props;

    /**
     * Single-table design.
     *
     * Access patterns:
     *   PK                       SK                       Entity
     *   USER#{userId}            PROFILE                  User profile
     *   USER#{userId}            BOOKMARK#{listingId}     Bookmarked trade listing
     *   USER#{userId}            QUERY#{queryId}          Saved trade query
     *   USER#{userId}            IDEAL#{idealId}          Ideal item definition
     *   USER#{userId}            SESSION#{sessionId}      Crafting session
     *   CACHE#TRADE#{hash}       RESULT                   Trade API cache (60s TTL)
     *   CACHE#PRICE              LATEST                   poe2.ninja price cache (10m TTL)
     */
    this.table = new dynamodb.Table(this, "MainTable", {
      tableName: `poe2-craft-trader-${env_name}`,
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey:      { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode:  dynamodb.BillingMode.PAY_PER_REQUEST,
      // TTL for cache entries — set `ttl` attribute (unix seconds) on items to expire them
      timeToLiveAttribute: "ttl",
      removalPolicy: env_name === "prod"
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: env_name === "prod",
    });

    // GSI: query by entity type across all users (e.g. "all bookmarks")
    this.table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey:      { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Output the table name for reference
    new cdk.CfnOutput(this, "TableName", {
      value: this.table.tableName,
      exportName: `poe2-table-name-${env_name}`,
    });

    new cdk.CfnOutput(this, "TableArn", {
      value: this.table.tableArn,
      exportName: `poe2-table-arn-${env_name}`,
    });
  }
}
