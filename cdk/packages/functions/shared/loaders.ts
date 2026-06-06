/**
 * DynamoDB + S3 loaders for the craft Lambdas.
 *  - loadPool(baseId, ilvl): Query mods by base, build the (prefix/suffix) pool.
 *  - loadPrices(): read the currency price cache, fall back to sane defaults.
 *  - read/writeScratch: pass the resolved {pool,prices,target} blob between
 *    Step Functions states via S3 (avoids the 256KB state I/O limit).
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { RawMod, ModPool, PriceTable, ScratchBlob } from "./types";
import { build_pools } from "./engine";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const TABLE  = process.env.DYNAMODB_TABLE ?? "";
const BUCKET = process.env.SCRATCH_BUCKET ?? "";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const s3  = new S3Client({ region: REGION });

/** Currency prices in exalts — fallback when the price cache is empty. */
export const DEFAULT_PRICES: PriceTable = {
  white_base: 0.1, chaos: 3, greater_chaos: 3, perfect_chaos: 3, alch: 0.5, annul: 40,
  exalt: 1, greater_exalt: 1, perfect_exalt: 1, regal: 0.25, greater_regal: 0.25, perfect_regal: 0.25,
  transmute: 0.1, greater_transmute: 0.1, perfect_transmute: 0.1,
  augment: 0.07, greater_augment: 0.07, perfect_augment: 0.07,
  alteration: 0.05, fracturing_orb: 100, divine: 90,
  runic_alloy: 1, adaptive_alloy: 1, protective_alloy: 1, expansive_alloy: 1, swift_alloy: 1,
  cyclonic_alloy: 1, prismatic_alloy: 1, mystic_alloy: 1, sovereign_alloy: 1, celestial_alloy: 1,
  transcendent_alloy: 1, the_runebinders_alloy: 1, the_runefathers_alloy: 1,
  // Omens are separate one-per-use consumables, priced per use.
  omen_whittling: 2, omen_greater_annulment: 1, omen_sinistral_alchemy: 1, omen_dextral_alchemy: 1,
  omen_sinistral_coronation: 1, omen_dextral_coronation: 1,
  omen_sinistral: 1, omen_dextral: 1, omen_greater: 1,
  omen_sinistral_erasure: 1, omen_dextral_erasure: 1,
  omen_sinistral_crystallisation: 1, omen_dextral_crystallisation: 1,
};

/** Load the mod pool for a base from DynamoDB and resolve it for this ilvl. */
export async function loadPool(baseId: string, ilvl: number): Promise<ModPool> {
  const items: RawMod[] = [];
  let lastKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk",
      ExpressionAttributeValues: { ":pk": `MODS#${baseId}` },
      ExclusiveStartKey: lastKey,
    }));
    for (const it of res.Items ?? []) {
      items.push({
        modId:     it.modId,
        name:      it.name,
        affix:     it.affix,
        modgroups: it.modgroups ?? [],
        tags:      it.tags ?? [],
        statId:    it.statId,
        tiers:     it.tiers ?? [],
      });
    }
    lastKey = res.LastEvaluatedKey;
  } while (lastKey);

  return build_pools(items, ilvl);
}

/** Load currency prices from the price cache item, merged over defaults. */
export async function loadPrices(): Promise<PriceTable> {
  try {
    const res = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: "CACHE#PRICE", SK: "LATEST" } }));
    const cached = (res.Item?.prices ?? {}) as PriceTable;
    return { ...DEFAULT_PRICES, ...cached };
  } catch {
    return { ...DEFAULT_PRICES };
  }
}

const scratchKey = (executionName: string) => `exec/${executionName}.json`;

export async function writeScratch(executionName: string, blob: ScratchBlob): Promise<string> {
  const key = scratchKey(executionName);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, ContentType: "application/json",
    Body: JSON.stringify(blob, (_k, v) => (v instanceof Set ? [...v] : v)),
  }));
  return key;
}

export async function readScratch(key: string): Promise<ScratchBlob> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const text = await res.Body!.transformToString();
  return JSON.parse(text) as ScratchBlob;
}

export async function deleteScratch(key: string): Promise<void> {
  try { await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })); } catch { /* best effort */ }
}
