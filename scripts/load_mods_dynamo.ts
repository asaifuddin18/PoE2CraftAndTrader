/**
 * Load mod-weight data into DynamoDB for the craft solver.
 *
 * Reads web/public/ideal-item-data.json (mods keyed by baseId) and writes one
 * item per mod:  PK = MODS#{baseId}, SK = MOD#{modId}.
 *
 * Run from the cdk dir so the @aws-sdk deps resolve:
 *   cd cdk && DYNAMODB_TABLE=poe2-craft-trader-dev npx ts-node ../scripts/load_mods_dynamo.ts
 *
 * Requires AWS credentials in the environment (same account/region as the table).
 */
import * as fs from "fs";
import * as path from "path";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";

const TABLE  = process.env.DYNAMODB_TABLE ?? "poe2-craft-trader-dev";
const REGION = process.env.AWS_REGION ?? "us-east-1";
const DATA   = path.join(__dirname, "..", "web", "public", "ideal-item-data.json");

interface RawMod {
  modId: string; name: string; affix: string;
  modgroups?: string[]; tags?: string[]; statId?: string;
  tiers: { tier: number; ilvl: number; weight: number; values: unknown[] }[];
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));

async function batchWrite(items: Record<string, unknown>[]) {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    let requestItems: Record<string, { PutRequest: { Item: Record<string, unknown> } }[]> = {
      [TABLE]: chunk.map(Item => ({ PutRequest: { Item } })),
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
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const modsByBase: Record<string, RawMod[]> = data.mods ?? {};

  let totalMods = 0;
  for (const [baseId, mods] of Object.entries(modsByBase)) {
    // De-dup by modId (last wins) so SKs are unique within a base.
    const byId = new Map<string, RawMod>();
    for (const m of mods) byId.set(m.modId, m);

    const items = [...byId.values()].map(m => ({
      PK: `MODS#${baseId}`,
      SK: `MOD#${m.modId}`,
      modId: m.modId,
      name: m.name,
      affix: m.affix,
      modgroups: m.modgroups ?? [],
      tags: m.tags ?? [],
      statId: m.statId ?? null,
      tiers: m.tiers ?? [],
    }));

    await batchWrite(items);
    totalMods += items.length;
    console.log(`base ${baseId}: wrote ${items.length} mods`);
  }
  console.log(`\nDone. ${Object.keys(modsByBase).length} bases, ${totalMods} mods → ${TABLE}`);
}

main().catch(err => { console.error(err); process.exit(1); });
