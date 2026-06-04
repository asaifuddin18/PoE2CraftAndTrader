import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const REGION      = process.env.AWS_REGION      ?? "us-east-1";
export const TABLE = process.env.DYNAMODB_TABLE  ?? "poe2-craft-trader-dev";

const raw = new DynamoDBClient({ region: REGION });
export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions:   { removeUndefinedValues: true },
  unmarshallOptions: { wrapNumbers: false },
});

// ── Key helpers ───────────────────────────────────────────────────────────────

export function userPK(userId: string) { return `USER#${userId}`; }
export function bookmarkSK(listingId: string) { return `BOOKMARK#${listingId}`; }
export function querySK(queryId: string) { return `QUERY#${queryId}`; }
export function idealSK(idealId: string) { return `IDEAL#${idealId}`; }
export function sessionSK(sessionId: string) { return `SESSION#${sessionId}`; }

// ── Generic helpers ───────────────────────────────────────────────────────────

export async function dbPut(item: Record<string, unknown>) {
  return ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function dbGet(pk: string, sk: string) {
  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: pk, SK: sk },
  }));
  return res.Item ?? null;
}

export async function dbDelete(pk: string, sk: string) {
  return ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { PK: pk, SK: sk },
  }));
}

export async function dbQuery(pk: string, skPrefix?: string) {
  const res = await ddb.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: skPrefix
      ? "PK = :pk AND begins_with(SK, :prefix)"
      : "PK = :pk",
    ExpressionAttributeValues: {
      ":pk": pk,
      ...(skPrefix ? { ":prefix": skPrefix } : {}),
    },
  }));
  return res.Items ?? [];
}
