import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { runSolver, type SolverMod } from "@/lib/craft-solver";

// Price cache (5 min TTL)
let priceCache: {
  chaosExalt: number; annulExalt: number; fracOrbExalt: number; divineExalt: number;
  expiresAt: number;
} | null = null;

async function getPrices() {
  if (priceCache && priceCache.expiresAt > Date.now()) return priceCache;

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

    priceCache = {
      chaosExalt:   find("chaos")    || 3,
      annulExalt:   find("annul")    || 40,
      fracOrbExalt: find("fracturing-orb") || 100,
      divineExalt,
      expiresAt:    Date.now() + 5 * 60 * 1000,
    };
    return priceCache;
  } catch {
    return { chaosExalt: 3, annulExalt: 40, fracOrbExalt: 100, divineExalt: 90, expiresAt: 0 };
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { baseMods, targetMods, mode, ilvl, numSims } = body;

    if (!baseMods?.length)   return NextResponse.json({ error: "baseMods required" },   { status: 400 });
    if (!targetMods?.length) return NextResponse.json({ error: "targetMods required" }, { status: 400 });
    if (!mode)               return NextResponse.json({ error: "mode required" },        { status: 400 });

    const prices = await getPrices();
    const start  = Date.now();

    const result = runSolver(
      baseMods,
      {
        baseId:     "client",
        ilvl:       Number(ilvl) || 84,
        targetMods: (targetMods as SolverMod[]),
        mode,
        numSims:    Math.min(Number(numSims) || 100_000, 500_000),
      },
      prices,
    );

    return NextResponse.json({ ...result, elapsed_ms: Date.now() - start });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[craft/solve]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
