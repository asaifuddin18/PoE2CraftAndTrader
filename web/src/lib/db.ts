import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";

const REGION       = process.env.AWS_REGION      ?? "us-east-1";
export const TABLE = process.env.DYNAMODB_TABLE   ?? "poe2-craft-trader-dev";
const ROLE_ARN     = process.env.AWS_ROLE_ARN;

/**
 * Credential strategy:
 *  - On Vercel: AWS_ROLE_ARN is set + Vercel injects the OIDC token file.
 *    @vercel/oidc-aws-credentials-provider exchanges the token for short-lived
 *    credentials via AssumeRoleWithWebIdentity.
 *  - Locally: falls back to the standard AWS credential chain (env vars /
 *    ~/.aws/credentials), so local dev with AWS_ACCESS_KEY_ID + SECRET works
 *    without changes.
 */
async function buildClient(): Promise<DynamoDBClient> {
  if (ROLE_ARN && process.env.VERCEL) {
    const { awsCredentialsProvider } = await import(
      "@vercel/oidc-aws-credentials-provider"
    );
    return new DynamoDBClient({
      region: REGION,
      credentials: awsCredentialsProvider({ roleArn: ROLE_ARN }),
    });
  }
  // Local dev — uses default credential chain (env vars or ~/.aws/credentials)
  return new DynamoDBClient({ region: REGION });
}

// Singleton — created once per Lambda/function cold start
let _ddb: DynamoDBDocumentClient | null = null;

export async function getDdb(): Promise<DynamoDBDocumentClient> {
  if (_ddb) return _ddb;
  const raw = await buildClient();
  _ddb = DynamoDBDocumentClient.from(raw, {
    marshallOptions:   { removeUndefinedValues: true },
    unmarshallOptions: { wrapNumbers: false },
  });
  return _ddb;
}

// ── Key helpers ───────────────────────────────────────────────────────────────

export function userPK(userId: string)      { return `USER#${userId}`; }
export function bookmarkSK(listingId: string) { return `BOOKMARK#${listingId}`; }
export function querySK(queryId: string)    { return `QUERY#${queryId}`; }
export function idealSK(idealId: string)    { return `IDEAL#${idealId}`; }
export function sessionSK(sessionId: string){ return `SESSION#${sessionId}`; }

// ── Generic helpers ───────────────────────────────────────────────────────────

export async function dbPut(item: Record<string, unknown>) {
  const ddb = await getDdb();
  return ddb.send(new PutCommand({ TableName: TABLE, Item: item }));
}

export async function dbGet(pk: string, sk: string) {
  const ddb = await getDdb();
  const res = await ddb.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: pk, SK: sk },
  }));
  return res.Item ?? null;
}

export async function dbDelete(pk: string, sk: string) {
  const ddb = await getDdb();
  return ddb.send(new DeleteCommand({
    TableName: TABLE,
    Key: { PK: pk, SK: sk },
  }));
}

export async function dbQuery(pk: string, skPrefix?: string) {
  const ddb = await getDdb();
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
