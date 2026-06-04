/**
 * Craft Solver — Monte Carlo probability engine
 *
 * Models Chaos Orb rerolling: each use draws N mods from the weighted pool
 * (3 prefixes + 3 suffixes). We simulate many iterations and count successes.
 *
 * Mode: "exact"  — all target mods must appear at exactly the specified tier
 * Mode: "minTier" — all target mods must appear at tier ≤ minTier (T1 is best)
 */

// ── Types (shared with frontend) ─────────────────────────────────────────────

export interface SolverMod {
  modId:    string;   // craftofexile mod ID
  name:     string;   // display name
  affix:    "prefix" | "suffix";
  tier:     number;   // target tier (1 = best)
  minTier:  number;   // max acceptable tier (inclusive, 1 = strict exact)
}

export interface SolverInput {
  baseId:     string;       // craftofexile base ID (e.g. "1" = Ring)
  ilvl:       number;       // item level
  targetMods: SolverMod[];  // up to 6 mods
  mode:       "exact" | "minTier";
  numSims?:   number;       // default 100_000
}

export interface ChartPoint {
  attempts:    number;
  costExalt:   number;
  probability: number;  // 0–1
}

export interface SolverResult {
  mode:                "exact" | "minTier";
  probability:         number;   // P(success in 1 attempt)
  expectedAttempts:    number;   // 1/P
  expectedCostExalt:   number;   // expectedAttempts × chaosPrice
  expectedCostDisplay: number;   // in display currency
  displayCurrency:     "exalt" | "divine";
  divineInExalt:       number;
  chaosPriceExalt:     number;
  chartData:           ChartPoint[];
}

// ── Mod pool types (from ideal-item-data.json) ────────────────────────────────

interface ModTier {
  tier:   number;
  ilvl:   number;
  weight: number;
}

interface ModDef {
  modId:  string;
  name:   string;
  affix:  string;
  tiers:  ModTier[];
}

// ── Weighted random draw ──────────────────────────────────────────────────────

/** Precomputed pool for fast weighted sampling */
interface Pool {
  modIds:     string[];   // modId per tier entry
  tiers:      number[];   // tier number per entry
  cumWeights: number[];   // cumulative weights
  totalWeight: number;
}

function buildPool(mods: ModDef[], ilvl: number): Pool {
  const modIds: string[]     = [];
  const tiers: number[]      = [];
  const weights: number[]    = [];

  for (const mod of mods) {
    for (const tier of mod.tiers) {
      if (tier.ilvl > ilvl || tier.weight <= 0) continue;
      modIds.push(mod.modId);
      tiers.push(tier.tier);
      weights.push(tier.weight);
    }
  }

  const cumWeights: number[] = [];
  let sum = 0;
  for (const w of weights) { sum += w; cumWeights.push(sum); }

  return { modIds, tiers, cumWeights, totalWeight: sum };
}

/** Draw one random mod from pool, returns index */
function drawOne(pool: Pool, rng: () => number): number {
  const r = rng() * pool.totalWeight;
  let lo = 0, hi = pool.cumWeights.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pool.cumWeights[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Draw N distinct mods from pool (without replacement by modId) */
function drawN(pool: Pool, n: number, rng: () => number): { modId: string; tier: number }[] {
  const result: { modId: string; tier: number }[] = [];
  const usedMods = new Set<string>();

  let tries = 0;
  while (result.length < n && tries < n * 20) {
    tries++;
    const idx = drawOne(pool, rng);
    const modId = pool.modIds[idx];
    if (!usedMods.has(modId)) {
      usedMods.add(modId);
      result.push({ modId, tier: pool.tiers[idx] });
    }
  }
  return result;
}

// ── Core simulation ───────────────────────────────────────────────────────────

/** Check if a set of drawn mods satisfies all target mods */
function checkSuccess(
  drawn: { modId: string; tier: number }[],
  targets: SolverMod[],
  mode: "exact" | "minTier",
): boolean {
  for (const target of targets) {
    const match = drawn.find(d => d.modId === target.modId);
    if (!match) return false;

    if (mode === "exact") {
      if (match.tier !== target.tier) return false;
    } else {
      // minTier: accept tier 1 through minTier (lower number = better)
      const worstAcceptable = target.minTier || target.tier;
      if (match.tier > worstAcceptable) return false;
    }
  }
  return true;
}

export function runSolver(
  allMods: ModDef[],
  input: SolverInput,
  chaosPriceExalt: number,
  divineInExalt: number,
): SolverResult {
  const { ilvl, targetMods, mode, numSims = 100_000 } = input;

  // Build separate prefix/suffix pools
  const prefixMods = allMods.filter(m => m.affix === "prefix");
  const suffixMods = allMods.filter(m => m.affix === "suffix");
  const prefixPool = buildPool(prefixMods, ilvl);
  const suffixPool = buildPool(suffixMods, ilvl);

  const prefixTargets = targetMods.filter(m => m.affix === "prefix");
  const suffixTargets = targetMods.filter(m => m.affix === "suffix");

  // Validate target mods exist in pool
  const prefixPoolIds = new Set(prefixPool.modIds);
  const suffixPoolIds = new Set(suffixPool.modIds);
  for (const t of prefixTargets) {
    if (!prefixPoolIds.has(t.modId)) {
      throw new Error(`Prefix mod "${t.name}" (${t.modId}) not found in pool for this base at ilvl ${ilvl}`);
    }
  }
  for (const t of suffixTargets) {
    if (!suffixPoolIds.has(t.modId)) {
      throw new Error(`Suffix mod "${t.name}" (${t.modId}) not found in pool for this base at ilvl ${ilvl}`);
    }
  }

  // Number of prefix/suffix slots (3+3 for rare)
  const nPrefix = Math.max(3, prefixTargets.length);
  const nSuffix = Math.max(3, suffixTargets.length);

  // Fast LCG RNG
  let seed = 0x12345678;
  function rng(): number {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0x100000000;
  }

  let successes = 0;
  for (let i = 0; i < numSims; i++) {
    const prefixes = drawN(prefixPool, nPrefix, rng);
    const suffixes = drawN(suffixPool, nSuffix, rng);
    const all = [...prefixes, ...suffixes];
    if (checkSuccess(all, targetMods, mode)) successes++;
  }

  const probability = successes / numSims;

  // Expected cost
  const expectedAttempts  = probability > 0 ? 1 / probability : Infinity;
  const expectedCostExalt = expectedAttempts * chaosPriceExalt;
  const useDiv            = expectedCostExalt >= divineInExalt;
  const expectedCostDisplay = useDiv ? expectedCostExalt / divineInExalt : expectedCostExalt;

  // Chart data: cost vs cumulative probability
  // P(success by N attempts) = 1 - (1-p)^N
  const chartData: ChartPoint[] = [];
  if (probability > 0) {
    const maxAttempts = Math.min(Math.ceil(10 / probability), 100_000);
    const points = 60;
    const step   = Math.max(1, Math.floor(maxAttempts / points));

    for (let n = step; n <= maxAttempts; n += step) {
      chartData.push({
        attempts:    n,
        costExalt:   n * chaosPriceExalt,
        probability: 1 - Math.pow(1 - probability, n),
      });
    }
    // Always include the 50% and 90% milestones
    const p50 = Math.ceil(Math.log(0.5) / Math.log(1 - probability));
    const p90 = Math.ceil(Math.log(0.1) / Math.log(1 - probability));
    for (const n of [p50, p90]) {
      if (n > 0 && n <= maxAttempts) {
        chartData.push({
          attempts:    n,
          costExalt:   n * chaosPriceExalt,
          probability: 1 - Math.pow(1 - probability, n),
        });
      }
    }
    chartData.sort((a, b) => a.attempts - b.attempts);
  }

  return {
    mode,
    probability,
    expectedAttempts,
    expectedCostExalt,
    expectedCostDisplay,
    displayCurrency: useDiv ? "divine" : "exalt",
    divineInExalt,
    chaosPriceExalt,
    chartData,
  };
}
