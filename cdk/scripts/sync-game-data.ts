/**
 * Load mod-weight data into DynamoDB for the craft solver.
 *
 * Projects the committed TypeScript game-data catalog into DynamoDB.
 * The catalog is the source of truth; stale MODS# records are removed.
 *
 * Run from the cdk dir:
 *   DYNAMODB_TABLE=poe2-craft-trader-dev npm run sync:game-data
 *
 * Requires AWS credentials in the environment (same account/region as the table).
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { buildDynamoModItems } from "../packages/game-data/catalog";

const TABLE  = process.env.DYNAMODB_TABLE ?? "poe2-craft-trader-dev";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

type WriteRequest =
  | { PutRequest: { Item: Record<string, unknown> } }
  | { DeleteRequest: { Key: Record<string, unknown> } };

async function batchWrite(requests: WriteRequest[]) {
  for (let i = 0; i < requests.length; i += 25) {
    const chunk = requests.slice(i, i + 25);
    let requestItems: Record<string, WriteRequest[]> = {
      [TABLE]: chunk,
    };
    // Retry unprocessed items with simple backoff.
    for (let attempt = 0; attempt < 6 && Object.keys(requestItems).length > 0; attempt++) {
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: requestItems }));
      const unprocessed = res.UnprocessedItems ?? {};
      if (!unprocessed[TABLE]?.length) { requestItems = {}; break; }
      requestItems = unprocessed as typeof requestItems;
      await new Promise(r => setTimeout(r, 100 * 2 ** attempt));
    }
  }
}

async function main() {
  const items = buildDynamoModItems() as Record<string, unknown>[];
  const desiredKeys = new Set(items.map(item => `${item.PK}|${item.SK}`));
  const staleKeys: Record<string, unknown>[] = [];
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await ddb.send(new ScanCommand({
      TableName: TABLE,
      ProjectionExpression: "PK, SK",
      FilterExpression: "begins_with(PK, :prefix)",
      ExpressionAttributeValues: { ":prefix": "MODS#" },
      ExclusiveStartKey: lastKey,
    }));
    for (const item of result.Items ?? []) {
      if (!desiredKeys.has(`${item.PK}|${item.SK}`)) staleKeys.push({ PK: item.PK, SK: item.SK });
    }
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  await batchWrite(staleKeys.map(Key => ({ DeleteRequest: { Key } })));
  await batchWrite(items.map(Item => ({ PutRequest: { Item } })));
  console.log(`Done. Wrote ${items.length} game-data records and removed ${staleKeys.length} stale records → ${TABLE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
