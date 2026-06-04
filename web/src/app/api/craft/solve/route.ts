import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { auth } from "@/auth";
import { dbGet, userPK, idealSK } from "@/lib/db";
import { runSolver, type SolverInput } from "@/lib/craft-solver";

// Load ideal-item-data.json once at module level (warm cache)
let modDataCache: Record<string, unknown[]> | null = null;
function getModData(): Record<string, unknown[]> {
  if (modDataCache) return modDataCache;
  const raw = readFileSync(join(process.cwd(), "public/ideal-item-data.json"), "utf-8");
  const parsed = JSON.parse(raw);
  modDataCache = parsed.mods as Record<string, unknown[]>;
  return modDataCache;
}

// Reuse economy price cache (in-memory, 5 min TTL)
let priceCache: { chaosExalt: number; divineExalt: number; expiresAt: number } | null = null;
const PRICE_TTL = 5 * 60 * 1000;

async function getPrices(): Promise<{ chaosExalt: number; divineExalt: number }> {
  if (priceCache && priceCache.expiresAt > Date.now()) {
    return { chaosExalt: priceCache.chaosExalt, divineExalt: priceCache.divineExalt };
  }
  try {
    const res = await fetch("https://poe2scout.com/api/poe2/Leagues/Runes%20of%20Aldur/Currencies/ByCategory?Category=currency&PerPage=250", {
      headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    const data = await res.json();
    const items = data.Items ?? [];
    const chaos  = items.find((i: Record<string, string>) => i.ApiId === "chaos");
    const divine = items.find((i: Record<string, string>) => i.ApiId === "divine");

    const leagues = await fetch("https://poe2scout.com/api/poe2/Leagues", {
      headers: { "Accept": "application/json" },
    }).then(r => r.json());
    const league = leagues.find((l: Record<string, unknown>) => l.Value === "Runes of Aldur") ?? leagues[0];
    const divineExalt = (league?.DivinePrice as number) ?? 90;
    const chaosExalt  = (chaos?.CurrentPrice as number) ?? 3;

    priceCache = { chaosExalt, divineExalt, expiresAt: Date.now() + PRICE_TTL };
    return { chaosExalt, divineExalt };
  } catch {
    // Fallback prices
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
    const { baseId, idealItemId, mode, numSims } = body;

    if (!baseId || !idealItemId || !mode) {
      return NextResponse.json({ error: "baseId, idealItemId and mode are required" }, { status: 400 });
    }

    // Load the ideal item from DynamoDB
    const userId   = session.user.email;
    const idealItem = await dbGet(userPK(userId), idealSK(idealItemId));
    if (!idealItem) {
      return NextResponse.json({ error: "Ideal item not found" }, { status: 404 });
    }

    const ilvl = idealItem.ilvl ?? 84;
    const targetMods = (idealItem.targetMods ?? []).filter((m: Record<string, unknown>) => m.modId);

    if (targetMods.length === 0) {
      return NextResponse.json({ error: "Ideal item has no target mods defined" }, { status: 400 });
    }

    // Build solver input
    const solverInput: SolverInput = {
      baseId,
      ilvl,
      targetMods: targetMods.map((m: Record<string, unknown>) => ({
        modId:   String(m.modId),
        name:    String(m.label ?? ""),
        affix:   String(m.affix) as "prefix" | "suffix",
        tier:    Number(m.tier) || 1,
        minTier: Number(m.minTier) || Number(m.tier) || 1,
      })),
      mode,
      numSims: Math.min(numSims ?? 100_000, 500_000),
    };

    // Load mod pool
    const modData = getModData();
    const baseMods = (modData[baseId] ?? []) as unknown[];
    if (baseMods.length === 0) {
      return NextResponse.json({ error: `No mod data found for baseId ${baseId}` }, { status: 400 });
    }

    // Get currency prices
    const { chaosExalt, divineExalt } = await getPrices();

    // Run solver
    const start  = Date.now();
    const result = runSolver(baseMods as Parameters<typeof runSolver>[0], solverInput, chaosExalt, divineExalt);
    const elapsed = Date.now() - start;

    return NextResponse.json({ ...result, elapsed_ms: elapsed });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
