import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { solve, type SolverInput, type PriceTable } from "@/lib/craft-engine";

// Price cache (5 min TTL)
let priceCache: { prices: PriceTable; expiresAt: number } | null = null;

async function getPrices(): Promise<PriceTable> {
  if (priceCache && priceCache.expiresAt > Date.now()) return priceCache.prices;

  const defaults: PriceTable = {
    white_base:    0.1,
    chaos:         3,
    alch:          0.5,
    annul:         40,
    exalt:         1,     // base unit
    regal:         0.25,
    transmute:     0.1,
    augment:       0.07,
    alteration:    0.05,
    fracturing_orb:100,
    divine:        90,
  };

  try {
    const [currRes, leagueRes] = await Promise.all([
      fetch("https://poe2scout.com/api/poe2/Leagues/Runes%20of%20Aldur/Currencies/ByCategory?Category=currency&PerPage=250",
        { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" } }),
      fetch("https://poe2scout.com/api/poe2/Leagues",
        { headers: { "Accept": "application/json" } }),
    ]);
    const [currData, leagues] = await Promise.all([currRes.json(), leagueRes.json()]);

    const find = (apiId: string): number =>
      Number(currData.Items?.find((i: Record<string,unknown>) => i.ApiId === apiId)?.CurrentPrice) || 0;

    const league      = leagues.find((l: Record<string,unknown>) => l.Value === "Runes of Aldur") ?? leagues[0];
    const divineExalt = Number((league as Record<string,unknown>)?.DivinePrice) || 90;

    const prices: PriceTable = {
      ...defaults,
      chaos:          find("chaos")          || defaults.chaos,
      annul:          find("annul")          || defaults.annul,
      fracturing_orb: find("fracturing-orb") || defaults.fracturing_orb,
      regal:          find("regal")          || defaults.regal,
      divine:         divineExalt,
    };

    priceCache = { prices, expiresAt: Date.now() + 5 * 60 * 1000 };
    return prices;
  } catch {
    return defaults;
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { baseMods, targetMods, ilvl, mode, k_required, essenceMod } = body;

    if (!baseMods?.length)   return NextResponse.json({ error: "baseMods required" },   { status: 400 });
    if (!targetMods?.length) return NextResponse.json({ error: "targetMods required" }, { status: 400 });

    const input: SolverInput = {
      baseMods,
      targetMods,
      ilvl:       Number(ilvl) || 84,
      mode:       mode || "minTier",
      k_required: Number(k_required) || targetMods.length,
      essenceMod,
    };

    const prices = await getPrices();
    const result = solve(input, prices);

    return NextResponse.json({ ...result, prices });
  } catch (err) {
    const msg   = err instanceof Error ? err.message  : String(err);
    const stack = err instanceof Error ? err.stack     : "";
    console.error("[craft/solve] ERROR:", msg, "\n", stack);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
