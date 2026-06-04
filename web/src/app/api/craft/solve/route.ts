import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runSolver, type SolverInput } from "@/lib/craft-solver";

// Economy price cache (5 min TTL)
let priceCache: { chaosExalt: number; divineExalt: number; expiresAt: number } | null = null;

async function getPrices(): Promise<{ chaosExalt: number; divineExalt: number }> {
  if (priceCache && priceCache.expiresAt > Date.now()) {
    return { chaosExalt: priceCache.chaosExalt, divineExalt: priceCache.divineExalt };
  }
  try {
    const [currRes, leagueRes] = await Promise.all([
      fetch("https://poe2scout.com/api/poe2/Leagues/Runes%20of%20Aldur/Currencies/ByCategory?Category=currency&PerPage=250",
        { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" } }),
      fetch("https://poe2scout.com/api/poe2/Leagues",
        { headers: { "Accept": "application/json" } }),
    ]);
    const [currData, leagues] = await Promise.all([currRes.json(), leagueRes.json()]);

    const chaos   = currData.Items?.find((i: Record<string,unknown>) => i.ApiId === "chaos");
    const league  = leagues.find((l: Record<string,unknown>) => l.Value === "Runes of Aldur") ?? leagues[0];
    const divineExalt = Number((league as Record<string,unknown>)?.DivinePrice) || 90;
    const chaosExalt  = Number((chaos as Record<string,unknown>)?.CurrentPrice) || 3;

    priceCache = { chaosExalt, divineExalt, expiresAt: Date.now() + 5 * 60 * 1000 };
    return { chaosExalt, divineExalt };
  } catch {
    return { chaosExalt: 3, divineExalt: 90 };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Client sends the filtered mod pool — no filesystem read needed
    const { baseMods, targetMods, mode, ilvl, numSims } = body;

    if (!baseMods?.length) return NextResponse.json({ error: "baseMods required" }, { status: 400 });
    if (!targetMods?.length) return NextResponse.json({ error: "targetMods required" }, { status: 400 });
    if (!mode) return NextResponse.json({ error: "mode required" }, { status: 400 });

    const input: SolverInput = {
      baseId:     "client",
      ilvl:       Number(ilvl) || 84,
      targetMods,
      mode,
      numSims:    Math.min(Number(numSims) || 100_000, 500_000),
    };

    const { chaosExalt, divineExalt } = await getPrices();
    const start  = Date.now();
    const result = runSolver(baseMods, input, chaosExalt, divineExalt);
    const elapsed = Date.now() - start;

    // Debug info — remove once working
    const prefixMods = baseMods.filter((m: Record<string,unknown>) => m.affix === "prefix");
    const suffixMods = baseMods.filter((m: Record<string,unknown>) => m.affix === "suffix");
    const debug = {
      baseModsCount:   baseMods.length,
      prefixModsCount: prefixMods.length,
      suffixModsCount: suffixMods.length,
      targetModsReceived: targetMods.map((m: Record<string,unknown>) => ({
        modId: m.modId, affix: m.affix, tier: m.tier, minTier: m.minTier,
      })),
      poolModIds: {
        prefix: prefixMods.map((m: Record<string,unknown>) => ({
          modId: m.modId, tiers: (m.tiers as {tier:number;weight:number}[]).map(t => `T${t.tier}:w${t.weight}`).join(',')
        })),
        suffix: suffixMods.map((m: Record<string,unknown>) => ({
          modId: m.modId, tiers: (m.tiers as {tier:number;weight:number}[]).map(t => `T${t.tier}:w${t.weight}`).join(',')
        })),
      }
    };

    return NextResponse.json({ ...result, elapsed_ms: elapsed, debug });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[craft/solve]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
