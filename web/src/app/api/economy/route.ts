import { NextResponse } from "next/server";

const POE2SCOUT = "https://poe2scout.com/api/poe2";
const TTL_MS    = 5 * 60 * 1000;

// Server-side cache
let cache: { data: EconomyData; expiresAt: number } | null = null;

export interface CurrencyEntry {
  apiId:           string;
  name:            string;
  iconUrl:         string;
  exaltValue:      number;
  divineValue:     number;
  displayValue:    number;
  displayCurrency: "exalt" | "divine";
  category:        string;
}

export interface EconomyCategory {
  id:      string;
  label:   string;
  entries: CurrencyEntry[];
}

export interface EconomyData {
  league:        string;
  divineInExalt: number;
  updatedAt:     string;
  categories:    EconomyCategory[];
}

// All categories to fetch with their display labels
const CURRENCY_CATS: { id: string; label: string }[] = [
  { id: "currency",   label: "Core Currency"    },
  { id: "abyss",      label: "Abyss (Bones)"    },
  { id: "essences",   label: "Essences"          },
  { id: "ritual",     label: "Omens & Ritual"    },
  { id: "breach",     label: "Breach Catalysts"  },
  { id: "delirium",   label: "Liquid Emotions"   },
  { id: "verisium",   label: "Alloys"            },
  { id: "ultimatum",  label: "Soul Cores"        },
  { id: "expedition", label: "Expedition"        },
  { id: "incursion",  label: "Incursion"         },
];

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function fetchCategory(catId: string, league: string, divineInExalt: number): Promise<CurrencyEntry[]> {
  const encoded = encodeURIComponent(league);
  const url = `${POE2SCOUT}/Leagues/${encoded}/Currencies/ByCategory?Category=${catId}&PerPage=250`;
  const data = await fetchJson(url);
  const items = data.Items ?? [];

  return items
    .filter((item: Record<string, unknown>) => item.CurrentPrice != null && item.ApiId !== "exalted")
    .map((item: Record<string, unknown>): CurrencyEntry => {
      const exaltValue  = item.CurrentPrice as number;
      const divineValue = exaltValue / divineInExalt;
      // Divine Orb itself: always show in exalts (avoid circular "1 div")
      const useDiv      = exaltValue >= divineInExalt && item.ApiId !== "divine";
      return {
        apiId:           String(item.ApiId  ?? ""),
        name:            String(item.Text   ?? ""),
        iconUrl:         String(item.IconUrl ?? ""),
        exaltValue,
        divineValue,
        displayValue:    useDiv ? divineValue : exaltValue,
        displayCurrency: useDiv ? "divine" : "exalt",
        category:        catId,
      };
    })
    .sort((a: CurrencyEntry, b: CurrencyEntry) => b.exaltValue - a.exaltValue);
}

async function buildEconomyData(league: string): Promise<EconomyData> {
  const encoded = encodeURIComponent(league);

  // League info for divine/exalt rate
  const leagues: Record<string, unknown>[] = await fetchJson(`${POE2SCOUT}/Leagues`);
  const leagueInfo  = leagues.find(l => l.Value === league) ?? leagues.find(l => l.IsCurrent) ?? leagues[0];
  const divineInExalt = (leagueInfo as Record<string, unknown>)?.DivinePrice as number ?? 90;

  // Fetch all categories in parallel
  const results = await Promise.allSettled(
    CURRENCY_CATS.map(cat => fetchCategory(cat.id, league, divineInExalt))
  );

  const categories: EconomyCategory[] = CURRENCY_CATS
    .map((cat, i) => ({
      id:      cat.id,
      label:   cat.label,
      entries: results[i].status === "fulfilled" ? results[i].value : [],
    }))
    .filter(cat => cat.entries.length > 0);

  return { league, divineInExalt, updatedAt: new Date().toISOString(), categories };
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
