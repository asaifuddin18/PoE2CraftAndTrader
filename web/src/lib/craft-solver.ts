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
  probability:         number;
  expectedAttempts:    number | null;
  expectedCostExalt:   number | null;
  expectedCostDisplay: number | null;
  displayCurrency:     "exalt" | "divine";
  divineInExalt:       number;
  chaosPriceExalt:     number;
  chartData:           ChartPoint[];
  elapsed_ms?:         number;
  isAnalytical?:       boolean; // true when Monte Carlo returned 0 and we used analytical estimate
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

// ── Analytical probability ────────────────────────────────────────────────────
// Used as fallback when Monte Carlo returns 0 (probability too low for simulation).
// Computes exact sequential-sampling-without-replacement probability.

/** Sum of weights for a specific mod at acceptable tiers */
function acceptableWeight(pool: Pool, modId: string, mode: "exact" | "minTier", target: SolverMod): number {
  let w = 0;
  for (let i = 0; i < pool.modIds.length; i++) {
    if (pool.modIds[i] !== modId) continue;
    const tier = pool.tiers[i];
    const worst = mode === "exact" ? target.tier : (target.minTier || target.tier);
    if (mode === "exact" && tier !== target.tier) continue;
    if (mode !== "exact" && tier > worst) continue;
    // Individual weight = diff in cumulative weights
    w += pool.cumWeights[i] - (i > 0 ? pool.cumWeights[i - 1] : 0);
  }
  return w;
}

/** Total weight for a mod across all tiers */
function totalModWeight(pool: Pool, modId: string): number {
  let w = 0;
  for (let i = 0; i < pool.modIds.length; i++) {
    if (pool.modIds[i] !== modId) continue;
    w += pool.cumWeights[i] - (i > 0 ? pool.cumWeights[i - 1] : 0);
  }
  return w;
}

/** P(all targets appear at acceptable tiers in nSlots draws) — exact sequential formula,
 *  summed over all permutations. Uses memoised recursion for efficiency. */
function analyticalSetProb(
  pool: Pool,
  targets: SolverMod[],
  nSlots: number,
  mode: "exact" | "minTier",
): number {
  if (targets.length === 0) return 1;
  if (targets.length > nSlots) return 0;

  // Precompute per-target acceptable and total weights
  const accWeights  = targets.map(t => acceptableWeight(pool, t.modId, mode, t));
  const totalWeights = targets.map(t => totalModWeight(pool, t.modId));

  // Sum over all permutations of the targets, multiplied by nSlots*(nSlots-1)*...
  // For small k (≤3) this is at most 6 permutations — enumerate them all.
  let total = 0;
  const k = targets.length;

  function permute(indices: number[], used: boolean[], W: number, product: number): void {
    if (indices.length === k) {
      // Multiply by (nSlots × (nSlots-1) × ... × (nSlots-k+1)) / (W_slot1 × W_slot2 × ...)
      // already encoded in sequential draws; multiply by slot-selection factor
      let slotFactor = 1;
      for (let s = 0; s < k; s++) slotFactor *= (nSlots - s);
      total += product * slotFactor;
      return;
    }
    for (let i = 0; i < k; i++) {
      if (used[i]) continue;
      used[i] = true;
      permute(
        [...indices, i],
        used,
        W - totalWeights[i],
        product * (accWeights[i] / W),
      );
      used[i] = false;
    }
  }

  permute([], Array(k).fill(false), pool.totalWeight, 1);

  // Divide by k! because we already counted each permutation once inside and
  // the slot factor accounts for ordering. Actually — each permutation is a
  // distinct ordering, so the product is already the correct marginal probability.
  // We need to divide by k! to avoid double-counting across identical orderings.
  // Wait: permute() already enumerates each ordering once, so we sum k! terms,
  // each representing one specific assignment. This IS the correct marginal P.
  // But we multiplied by slotFactor inside, which over-counts — let's rethink.
  //
  // Correct formula: P = Σ_{permutation σ} P(σ(1) in slot 1) × P(σ(2) in slot 2|...) × ...
  // × C(nSlots, k) — no, slots are ORDERED draws.
  //
  // For n draws (ordered), k specific mods each at acceptable tier:
  // P = Σ_{k-perm of slots} Σ_{ordering of targets to those slots}
  //   = C(n,k) × k! × product_of_sequential_probs_averaged_over_orderings
  //
  // Simplest correct formula when n=k (all slots are target slots):
  // P = Σ_orderings product_of_sequential_probs (each ordering gives one term)
  //
  // Our permute() gives Σ_orderings (acc_w/W_sequential), but WITHOUT the slot factor.
  // The slotFactor inside was wrong. Let's remove it and compute correctly:

  // Redo cleanly:
  total = 0;

  function permuteClean(used: boolean[], W: number, product: number, depth: number): void {
    if (depth === k) {
      total += product;
      return;
    }
    for (let i = 0; i < k; i++) {
      if (used[i]) continue;
      used[i] = true;
      permuteClean(used, W - totalWeights[i], product * (accWeights[i] / W), depth + 1);
      used[i] = false;
    }
  }

  permuteClean(Array(k).fill(false), pool.totalWeight, 1, 0);

  // `total` is now Σ_orderings P(this specific ordering).
  // Each ordering is one way the k mods can appear in k slots.
  // But we have nSlots slots total, and nSlots ≥ k.
  // For nSlots > k: multiply by C(nSlots, k) since any k of the nSlots can be the target slots.
  // For nSlots = k: multiply by 1.
  const choose = (n: number, r: number): number => {
    if (r > n) return 0;
    if (r === 0 || r === n) return 1;
    let v = 1;
    for (let i = 0; i < r; i++) v = v * (n - i) / (i + 1);
    return Math.round(v);
  };

  return total * choose(nSlots, k);
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

  let probability    = successes / numSims;
  let isAnalytical   = false;

  // When Monte Carlo returns 0, fall back to analytical calculation.
  // This happens when probability is so low that 100k sims almost never hit it.
  if (probability === 0) {
    const analyticPref = analyticalSetProb(prefixPool, prefixTargets, nPrefix, mode);
    const analyticSuff = analyticalSetProb(suffixPool, suffixTargets, nSuffix, mode);
    probability   = analyticPref * analyticSuff;
    isAnalytical  = true;
  }

  // Expected cost — use null instead of Infinity so JSON serialisation is safe
  const expectedAttempts    = probability > 0 ? 1 / probability : null;
  const expectedCostExalt   = expectedAttempts != null ? expectedAttempts * chaosPriceExalt : null;
  const useDiv              = expectedCostExalt != null && expectedCostExalt >= divineInExalt;
  const expectedCostDisplay = expectedCostExalt != null
    ? (useDiv ? expectedCostExalt / divineInExalt : expectedCostExalt)
    : null;

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
    isAnalytical,
  };
}
