import { NextResponse } from "next/server";

const POE2SCOUT = "https://poe2scout.com/api/poe2";

// Server-side cache — persists across warm invocations (5 min TTL)
let cache: { data: EconomyData; expiresAt: number } | null = null;
const TTL_MS = 5 * 60 * 1000;

export interface CurrencyEntry {
  apiId:      string;
  name:       string;
  iconUrl:    string;
  exaltValue: number;      // price in exalted orbs
  divineValue: number;     // price in divine orbs
  displayValue: number;    // value to display (in display currency)
  displayCurrency: "exalt" | "divine";
  chaosValue: number | null;
  category:   string;
}

export interface EconomyData {
  league:       string;
  divineInExalt: number;  // how many exalts per divine
  updatedAt:    string;
  currencies:   CurrencyEntry[];
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function buildEconomyData(league: string): Promise<EconomyData> {
  const encoded = encodeURIComponent(league);

  // League info (for divine price in exalts)
  const leagues: { Value: string; DivinePrice: number }[] = await fetchJson(`${POE2SCOUT}/Leagues`);
  const leagueInfo = leagues.find(l => l.Value === league) ?? leagues[0];
  const divineInExalt = leagueInfo?.DivinePrice ?? 90;

  // Fetch both pages of currencies
  const [page1, page2] = await Promise.all([
    fetchJson(`${POE2SCOUT}/Leagues/${encoded}/Currencies/ByCategory?Category=currency&Page=1`),
    fetchJson(`${POE2SCOUT}/Leagues/${encoded}/Currencies/ByCategory?Category=currency&Page=2`),
  ]);

  const rawItems = [...(page1.Items ?? []), ...(page2.Items ?? [])];

  const currencies: CurrencyEntry[] = rawItems
    .filter(item => item.CurrentPrice != null)
    .map(item => {
      const exaltValue   = item.CurrentPrice as number;
      const divineValue  = exaltValue / divineInExalt;
      const useDiv       = exaltValue >= divineInExalt;
      return {
        apiId:           item.ApiId ?? "",
        name:            item.Text ?? "",
        iconUrl:         item.IconUrl ?? "",
        exaltValue,
        divineValue,
        displayValue:    useDiv ? divineValue : exaltValue,
        displayCurrency: (useDiv ? "divine" : "exalt") as "exalt" | "divine",
        chaosValue:      null, // poe2scout uses exalt as base, not chaos
        category:        item.CategoryApiId ?? "currency",
      };
    })
    .sort((a, b) => b.exaltValue - a.exaltValue);

  return {
    league,
    divineInExalt,
    updatedAt: new Date().toISOString(),
    currencies,
  };
}

export async function GET(req: Request) {
  try {
    const league = new URL(req.url).searchParams.get("league") ?? "Runes of Aldur";

    if (cache && cache.expiresAt > Date.now()) {
      return NextResponse.json(cache.data);
    }

    const data = await buildEconomyData(league);
    cache = { data, expiresAt: Date.now() + TTL_MS };
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
