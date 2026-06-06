/**
 * price-sync — scheduled (EventBridge, ~10 min) currency price fetcher.
 *
 * Fetches live prices from poe2scout and writes them to DynamoDB, which is the
 * single source of truth for prices. Two kinds of items under PK=CACHE#PRICE:
 *   - SK=LATEST        → { prices, divineInExalt, league, updatedAt }  (solver)
 *   - SK=ECON#<catId>  → { catId, label, entries, updatedAt }          (economy UI)
 *
 * The craft solver reads LATEST via shared/loaders.loadPrices(); the Next.js
 * /api/economy route reads the ECON# items. Nothing else calls poe2scout.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const TABLE  = process.env.DYNAMODB_TABLE ?? "";
const POE2SCOUT = "https://poe2scout.com/api/poe2";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }), {
  marshallOptions: { removeUndefinedValues: true },
});

// Solver-default prices (must match shared/loaders.DEFAULT_PRICES). Live values
// are merged over these; anything without a live equivalent keeps the default.
const DEFAULT_PRICES: Record<string, number> = {
  white_base: 0.1, chaos: 3, greater_chaos: 3, perfect_chaos: 3, alch: 0.5, annul: 40,
  exalt: 1, greater_exalt: 1, perfect_exalt: 1, regal: 0.25, greater_regal: 0.25, perfect_regal: 0.25,
  transmute: 0.1, greater_transmute: 0.1, perfect_transmute: 0.1,
  augment: 0.07, greater_augment: 0.07, perfect_augment: 0.07,
  alteration: 0.05, fracturing_orb: 100, divine: 90,
  omen_whittling: 2, omen_greater_annulment: 1, omen_sinistral_alchemy: 1, omen_dextral_alchemy: 1,
  omen_sinistral_coronation: 1, omen_dextral_coronation: 1,
  omen_sinistral: 1, omen_dextral: 1, omen_greater: 1,
};

const CURRENCY_CATS: { id: string; label: string }[] = [
  { id: "currency",   label: "Core Currency"   },
  { id: "abyss",      label: "Abyss (Bones)"   },
  { id: "essences",   label: "Essences"        },
  { id: "ritual",     label: "Omens & Ritual"  },
  { id: "breach",     label: "Breach Catalysts"},
  { id: "delirium",   label: "Liquid Emotions" },
  { id: "verisium",   label: "Alloys"          },
  { id: "ultimatum",  label: "Soul Cores"      },
  { id: "expedition", label: "Expedition"      },
  { id: "incursion",  label: "Incursion"       },
];

interface CurrencyEntry {
  apiId: string; name: string; iconUrl: string;
  exaltValue: number; divineValue: number;
  displayValue: number; displayCurrency: "exalt" | "divine"; category: string;
}

// Map each solver price key to candidate poe2scout apiIds and/or a name regex.
const SOLVER_KEY_MATCHERS: Record<string, { apiIds?: string[]; name?: RegExp }> = {
  greater_exalt:  { name: /greater exalted orb/i },
  perfect_exalt:  { name: /perfect exalted orb/i },
  greater_chaos:  { name: /greater chaos orb/i },
  perfect_chaos:  { name: /perfect chaos orb/i },
  chaos:          { apiIds: ["chaos"],            name: /^chaos orb$/i },
  divine:         { apiIds: ["divine"],           name: /divine orb/i },
  annul:          { apiIds: ["annul", "annulment"], name: /annulment/i },
  greater_regal:  { name: /greater regal orb/i },
  perfect_regal:  { name: /perfect regal orb/i },
  regal:          { apiIds: ["regal"],            name: /^regal orb$/i },
  fracturing_orb: { apiIds: ["fracturing-orb", "fracturing"], name: /fracturing orb/i },
  alch:           { apiIds: ["alchemy"],          name: /orb of alchemy/i },
  greater_transmute: { name: /greater orb of transmutation/i },
  perfect_transmute: { name: /perfect orb of transmutation/i },
  transmute:      { apiIds: ["transmutation", "transmute"], name: /^orb of transmutation$/i },
  greater_augment: { name: /greater orb of augmentation/i },
  perfect_augment: { name: /perfect orb of augmentation/i },
  augment:        { apiIds: ["augmentation", "augment"], name: /^orb of augmentation$/i },
  omen_whittling: { name: /omen of whittling/i },
  omen_greater_annulment: { name: /omen of greater annulment/i },
  omen_sinistral_alchemy: { name: /omen of sinistral alchemy/i },
  omen_dextral_alchemy: { name: /omen of dextral alchemy/i },
  omen_sinistral_coronation: { name: /omen of sinistral coronation/i },
  omen_dextral_coronation: { name: /omen of dextral coronation/i },
  omen_sinistral: { name: /omen of sinistral exaltation/i },
  omen_dextral: { name: /omen of dextral exaltation/i },
  omen_greater: { name: /omen of greater exaltation/i },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchCategory(catId: string, league: string, divineInExalt: number): Promise<CurrencyEntry[]> {
  const url = `${POE2SCOUT}/Leagues/${encodeURIComponent(league)}/Currencies/ByCategory?Category=${catId}&PerPage=250`;
  const data = await fetchJson(url);
  return (data.Items ?? [])
    .filter((it: Record<string, unknown>) => it.CurrentPrice != null && it.ApiId !== "exalted")
    .map((it: Record<string, unknown>): CurrencyEntry => {
      const exaltValue = it.CurrentPrice as number;
      const divineValue = exaltValue / divineInExalt;
      const useDiv = exaltValue >= divineInExalt && it.ApiId !== "divine";
      return {
        apiId: String(it.ApiId ?? ""), name: String(it.Text ?? ""), iconUrl: String(it.IconUrl ?? ""),
        exaltValue, divineValue,
        displayValue: useDiv ? divineValue : exaltValue,
        displayCurrency: useDiv ? "divine" : "exalt",
        category: catId,
      };
    })
    .sort((a: CurrencyEntry, b: CurrencyEntry) => b.exaltValue - a.exaltValue);
}

function resolveSolverPrices(all: CurrencyEntry[], divineInExalt: number): Record<string, number> {
  const prices: Record<string, number> = { ...DEFAULT_PRICES, exalt: 1, divine: divineInExalt };
  for (const entry of all.filter(entry => entry.category === "essences")) {
    const key = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    prices[key] = entry.exaltValue;
  }
  for (const [key, m] of Object.entries(SOLVER_KEY_MATCHERS)) {
    const hit =
      (m.apiIds && all.find(e => m.apiIds!.includes(e.apiId))) ||
      (m.name && all.find(e => m.name!.test(e.name)));
    if (hit && hit.exaltValue > 0) prices[key] = hit.exaltValue;
  }
  return prices;
}

export async function handler() {
  // Resolve the active league (prefer current; fall back to a known default).
  const leagues: Record<string, unknown>[] = await fetchJson(`${POE2SCOUT}/Leagues`);
  const leagueInfo = leagues.find(l => l.IsCurrent) ?? leagues.find(l => l.Value === "Runes of Aldur") ?? leagues[0];
  const league = String((leagueInfo as Record<string, unknown>)?.Value ?? "Runes of Aldur");
  const divineInExalt = Number((leagueInfo as Record<string, unknown>)?.DivinePrice) || 90;

  const results = await Promise.allSettled(
    CURRENCY_CATS.map(c => fetchCategory(c.id, league, divineInExalt)),
  );

  const updatedAt = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 1-day safety expiry
  const allEntries: CurrencyEntry[] = [];

  // Per-category economy items (kept small; avoids the 400KB single-item limit).
  for (let i = 0; i < CURRENCY_CATS.length; i++) {
    const r = results[i];
    if (r.status !== "fulfilled" || r.value.length === 0) continue;
    allEntries.push(...r.value);
    await ddb.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: "CACHE#PRICE", SK: `ECON#${CURRENCY_CATS[i].id}`,
              catId: CURRENCY_CATS[i].id, label: CURRENCY_CATS[i].label,
              entries: r.value, updatedAt, ttl },
    }));
  }

  const prices = resolveSolverPrices(allEntries, divineInExalt);
  await ddb.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: "CACHE#PRICE", SK: "LATEST", prices, divineInExalt, league, updatedAt, ttl },
  }));

  console.log(`[price-sync] league=${league} div=${divineInExalt} entries=${allEntries.length} prices=${JSON.stringify(prices)}`);
  return { ok: true, league, entries: allEntries.length };
}
