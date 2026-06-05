/**
 * Craft Solver — Multi-path probability engine
 *
 * Models several crafting strategies and ranks them by expected cost.
 * All costs are in Exalted Orbs.
 *
 * Supported paths:
 *  1. Chaos Orb Spam       — reroll all mods until target appears
 *  2. Chaos per-mod        — per-mod: how expensive is each mod individually
 *  3. Fracture + Chaos     — lock the hardest mod first, chaos the rest
 *  4. Annul + Exalt finish — chaos until N-1 mods hit, annul wrong mod, exalt target
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SolverMod {
  modId:    string;
  name:     string;
  affix:    "prefix" | "suffix";
  tier:     number;   // target tier (1 = best)
  minTier:  number;   // worst acceptable tier
}

export interface ChartPoint {
  attempts:    number;
  costExalt:   number;
  probability: number;
}

export interface ModBreakdown {
  modId:         string;
  name:          string;
  affix:         "prefix" | "suffix";
  pPerRoll:      number;   // P(this mod appears at acceptable tier per chaos use)
  exaltCost:     number;   // E[exalts] to add this mod to 1 open slot
}

export interface CraftPath {
  id:                  string;
  name:                string;
  description:         string;
  probability:         number;
  expectedAttempts:    number | null;
  expectedCostExalt:   number | null;
  expectedCostDisplay: number | null;
  displayCurrency:     "exalt" | "divine";
  isAnalytical:        boolean;
  chartData:           ChartPoint[];
  isBest?:             boolean;
}

export interface SolverResult {
  mode:           "exact" | "minTier";
  paths:          CraftPath[];
  modBreakdown:   ModBreakdown[];
  divineInExalt:  number;
  chaosPriceExalt:number;
  annulPriceExalt:number;
  elapsed_ms?:    number;
}

// ── Pool types ─────────────────────────────────────────────────────────────────

interface ModTier { tier: number; ilvl: number; weight: number; }
interface ModDef  { modId: string; name: string; affix: string; tiers: ModTier[]; }

interface Pool {
  modIds:      string[];
  tiers:       number[];
  cumWeights:  number[];
  totalWeight: number;
}

// ── Pool building ──────────────────────────────────────────────────────────────

function buildPool(mods: ModDef[], ilvl: number): Pool {
  const modIds: string[]  = [];
  const tiers: number[]   = [];
  const weights: number[] = [];

  for (const mod of mods) {
    for (const t of mod.tiers) {
      if (t.ilvl > ilvl || t.weight <= 0) continue;
      modIds.push(mod.modId);
      tiers.push(t.tier);
      weights.push(t.weight);
    }
  }

  const cumWeights: number[] = [];
  let sum = 0;
  for (const w of weights) { sum += w; cumWeights.push(sum); }
  return { modIds, tiers, cumWeights, totalWeight: sum };
}

// ── Weighted sampling ──────────────────────────────────────────────────────────

function drawOne(pool: Pool, rng: () => number): number {
  const r = rng() * pool.totalWeight;
  let lo = 0, hi = pool.cumWeights.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (pool.cumWeights[mid] < r) lo = mid + 1; else hi = mid;
  }
  return lo;
}

function drawN(pool: Pool, n: number, rng: () => number): { modId: string; tier: number }[] {
  const result: { modId: string; tier: number }[] = [];
  const used = new Set<string>();
  let tries = 0;
  while (result.length < n && tries < n * 30) {
    tries++;
    const idx = drawOne(pool, rng);
    const modId = pool.modIds[idx];
    if (!used.has(modId)) { used.add(modId); result.push({ modId, tier: pool.tiers[idx] }); }
  }
  return result;
}

// ── Check success ──────────────────────────────────────────────────────────────

function checkSuccess(
  drawn: { modId: string; tier: number }[],
  targets: SolverMod[],
  mode: "exact" | "minTier",
): boolean {
  for (const t of targets) {
    const match = drawn.find(d => d.modId === t.modId);
    if (!match) return false;
    const worst = mode === "exact" ? t.tier : (t.minTier || t.tier);
    if (mode === "exact" && match.tier !== t.tier) return false;
    if (mode !== "exact" && match.tier > worst) return false;
  }
  return true;
}

// ── Analytical probability (fallback when Monte Carlo = 0) ────────────────────

function indivWeight(pool: Pool, idx: number): number {
  return pool.cumWeights[idx] - (idx > 0 ? pool.cumWeights[idx - 1] : 0);
}

function acceptableWeight(pool: Pool, modId: string, mode: "exact" | "minTier", target: SolverMod): number {
  let w = 0;
  for (let i = 0; i < pool.modIds.length; i++) {
    if (pool.modIds[i] !== modId) continue;
    const tier = pool.tiers[i];
    const worst = mode === "exact" ? target.tier : (target.minTier || target.tier);
    if (mode === "exact" ? tier === target.tier : tier <= worst) w += indivWeight(pool, i);
  }
  return w;
}

function totalModWeight(pool: Pool, modId: string): number {
  let w = 0;
  for (let i = 0; i < pool.modIds.length; i++) {
    if (pool.modIds[i] === modId) w += indivWeight(pool, i);
  }
  return w;
}

function analyticalSetProb(
  pool: Pool, targets: SolverMod[], nSlots: number, mode: "exact" | "minTier",
): number {
  if (targets.length === 0) return 1;
  if (targets.length > nSlots) return 0;
  const k = targets.length;
  const accW  = targets.map(t => acceptableWeight(pool, t.modId, mode, t));
  const totW  = targets.map(t => totalModWeight(pool, t.modId));
  let total = 0;
  function perm(used: boolean[], W: number, prod: number, depth: number): void {
    if (depth === k) { total += prod; return; }
    for (let i = 0; i < k; i++) {
      if (used[i]) continue;
      used[i] = true;
      perm(used, W - totW[i], prod * (accW[i] / W), depth + 1);
      used[i] = false;
    }
  }
  perm(Array(k).fill(false), pool.totalWeight, 1, 0);
  const choose = (n: number, r: number): number => {
    if (r > n || r < 0) return 0;
    if (r === 0 || r === n) return 1;
    let v = 1;
    for (let i = 0; i < r; i++) v = v * (n - i) / (i + 1);
    return Math.round(v);
  };
  return total * choose(nSlots, k);
}

// ── Monte Carlo + analytical combined ─────────────────────────────────────────

function computeProb(
  prefixPool: Pool, suffixPool: Pool,
  prefixTargets: SolverMod[], suffixTargets: SolverMod[],
  nPrefix: number, nSuffix: number,
  mode: "exact" | "minTier",
  numSims: number,
  seed: number,
): { probability: number; isAnalytical: boolean } {
  let s = seed;
  function rng(): number {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  }
  const allTargets = [...prefixTargets, ...suffixTargets];
  let successes = 0;
  for (let i = 0; i < numSims; i++) {
    const drawn = [...drawN(prefixPool, nPrefix, rng), ...drawN(suffixPool, nSuffix, rng)];
    if (checkSuccess(drawn, allTargets, mode)) successes++;
  }
  let probability = successes / numSims;
  let isAnalytical = false;
  if (probability === 0) {
    probability = analyticalSetProb(prefixPool, prefixTargets, nPrefix, mode)
                * analyticalSetProb(suffixPool, suffixTargets, nSuffix, mode);
    isAnalytical = true;
  }
  return { probability, isAnalytical };
}

// ── Chart generation ───────────────────────────────────────────────────────────

function makeChart(p: number, pricePerAttempt: number): ChartPoint[] {
  if (p <= 0) return [];
  const maxAttempts = Math.min(Math.ceil(10 / p), 200_000);
  const points = 60;
  const step = Math.max(1, Math.floor(maxAttempts / points));
  const chart: ChartPoint[] = [];
  for (let n = step; n <= maxAttempts; n += step) {
    chart.push({ attempts: n, costExalt: n * pricePerAttempt, probability: 1 - Math.pow(1 - p, n) });
  }
  const milestones = [0.5, 0.9].map(pct => Math.ceil(Math.log(1 - pct) / Math.log(1 - p)));
  for (const n of milestones) {
    if (n > 0 && n <= maxAttempts)
      chart.push({ attempts: n, costExalt: n * pricePerAttempt, probability: 1 - Math.pow(1 - p, n) });
  }
  chart.sort((a, b) => a.attempts - b.attempts);
  return chart;
}

function makePath(
  id: string, name: string, description: string,
  probability: number, isAnalytical: boolean,
  costPerAttemptExalt: number, divineInExalt: number,
): CraftPath {
  const expectedAttempts    = probability > 0 ? 1 / probability : null;
  const expectedCostExalt   = expectedAttempts != null ? expectedAttempts * costPerAttemptExalt : null;
  const useDiv              = expectedCostExalt != null && expectedCostExalt >= divineInExalt;
  const expectedCostDisplay = expectedCostExalt != null
    ? (useDiv ? expectedCostExalt / divineInExalt : expectedCostExalt) : null;

  return {
    id, name, description, probability, expectedAttempts,
    expectedCostExalt, expectedCostDisplay,
    displayCurrency: useDiv ? "divine" : "exalt",
    isAnalytical,
    chartData: makeChart(probability, costPerAttemptExalt),
  };
}

// ── Main solver ────────────────────────────────────────────────────────────────

export function runSolver(
  allMods: ModDef[],
  input: {
    baseId: string; ilvl: number; targetMods: SolverMod[];
    mode: "exact" | "minTier"; numSims?: number;
  },
  prices: {
    chaosExalt:  number;
    annulExalt:  number;
    fracOrbExalt:number;
    divineExalt: number;
  },
): SolverResult {
  const { ilvl, targetMods, mode, numSims = 100_000 } = input;
  const { chaosExalt, annulExalt, fracOrbExalt, divineExalt } = prices;

  const prefixMods = allMods.filter(m => m.affix === "prefix");
  const suffixMods = allMods.filter(m => m.affix === "suffix");
  const prefixPool = buildPool(prefixMods, ilvl);
  const suffixPool = buildPool(suffixMods, ilvl);

  const prefixTargets = targetMods.filter(m => m.affix === "prefix");
  const suffixTargets = targetMods.filter(m => m.affix === "suffix");
  const nPrefix = Math.max(3, prefixTargets.length);
  const nSuffix = Math.max(3, suffixTargets.length);

  // ── Per-mod breakdown ──────────────────────────────────────────────────────
  const modBreakdown: ModBreakdown[] = targetMods.map(t => {
    const pool = t.affix === "prefix" ? prefixPool : suffixPool;
    const accW = acceptableWeight(pool, t.modId, mode, t);
    const pPerRoll = pool.totalWeight > 0 ? accW / pool.totalWeight : 0;
    const exaltCost = pPerRoll > 0 ? 1 / pPerRoll : Infinity;
    return { modId: t.modId, name: t.name, affix: t.affix, pPerRoll, exaltCost };
  }).sort((a, b) => a.pPerRoll - b.pPerRoll);

  const paths: CraftPath[] = [];

  // ── Path 1: Chaos Orb Spam ─────────────────────────────────────────────────
  const chaosResult = computeProb(
    prefixPool, suffixPool, prefixTargets, suffixTargets,
    nPrefix, nSuffix, mode, numSims, 0x12345678,
  );
  paths.push(makePath(
    "chaos", "Chaos Orb Spam",
    "Reroll all mods simultaneously until all targets appear.",
    chaosResult.probability, chaosResult.isAnalytical,
    chaosExalt, divineExalt,
  ));

  // ── Path 2: Fracture hardest mod → Chaos rest ─────────────────────────────
  // Strategy: chaos until the single hardest mod appears, fracture it, then
  // chaos the remaining N-1 mods (which have higher combined probability).
  if (targetMods.length >= 2 && fracOrbExalt > 0) {
    const hardest = modBreakdown[0]; // lowest pPerRoll
    const restTargets = targetMods.filter(m => m.modId !== hardest.modId);
    const restPrefix  = restTargets.filter(m => m.affix === "prefix");
    const restSuffix  = restTargets.filter(m => m.affix === "suffix");

    // E[chaos to hit hardest mod alone] = 1/p_hardest
    const pHardestAlone = hardest.pPerRoll;

    // After fracturing, we need N-1 mods in the remaining N-1 slots
    // One slot is already taken by the fractured mod, so:
    const nPrefixAfter = hardest.affix === "prefix" ? nPrefix - 1 : nPrefix;
    const nSuffixAfter = hardest.affix === "suffix" ? nSuffix - 1 : nSuffix;

    const fracResult = computeProb(
      prefixPool, suffixPool, restPrefix, restSuffix,
      nPrefixAfter, nSuffixAfter, mode, numSims, 0xABCDEF01,
    );

    if (pHardestAlone > 0 && fracResult.probability > 0) {
      // E[cost] = E[chaos to hit hardest] × chaos + fracture_orb + E[chaos for rest] × chaos
      const eChaosForHardest = (1 / pHardestAlone) * chaosExalt;
      const eChaosForRest    = (1 / fracResult.probability) * chaosExalt;
      const totalExpected    = eChaosForHardest + fracOrbExalt + eChaosForRest;

      // Build a "virtual" path using combined probability and cost
      // We express it as a single probability at combined cost
      const fracPath: CraftPath = {
        id:          "fracture",
        name:        "Fracture + Chaos",
        description: `Chaos until "${hardest.name.slice(0, 35)}" appears, fracture it (locks it permanently), then chaos for the remaining ${restTargets.length} mods.`,
        probability:         fracResult.probability, // probability of the "rest" phase
        expectedAttempts:    null, // multi-phase, not a simple geometric
        expectedCostExalt:   totalExpected,
        expectedCostDisplay: totalExpected >= divineExalt ? totalExpected / divineExalt : totalExpected,
        displayCurrency:     totalExpected >= divineExalt ? "divine" : "exalt",
        isAnalytical:        chaosResult.isAnalytical || fracResult.isAnalytical,
        chartData:           [], // multi-phase — chart not trivial
      };
      paths.push(fracPath);
    }
  }

  // ── Path 3: Chaos until N-1, Annul wrong mod, Exalt hardest ───────────────
  // Strategy: chaos until N-1 target mods appear + 1 non-target,
  // annul the non-target (~1/total_mods chance), then exalt the hardest.
  if (targetMods.length >= 2 && annulExalt > 0) {
    const hardest = modBreakdown[0];
    const restTargets = targetMods.filter(m => m.modId !== hardest.modId);
    const restPrefix  = restTargets.filter(m => m.affix === "prefix");
    const restSuffix  = restTargets.filter(m => m.affix === "suffix");

    // The "chaos until N-1 specific mods appear" probability
    // We need the N-1 rest mods to appear, but we want one slot to have a NON-target mod
    // so we can annul and then exalt.
    // Approximation: P(N-1 rest mods hit in N-1 slots) — one slot free for hardest mod's affix
    const nPrefixPhase = hardest.affix === "prefix" ? nPrefix - 1 : nPrefix;
    const nSuffixPhase = hardest.affix === "suffix" ? nSuffix - 1 : nSuffix;

    const annulResult = computeProb(
      prefixPool, suffixPool, restPrefix, restSuffix,
      nPrefixPhase, nSuffixPhase, mode, numSims, 0xDEADBEEF,
    );

    // P(annul removes the unwanted mod) ≈ 1 / total_mods_on_item
    const totalMods   = nPrefix + nSuffix;
    const pAnnulHits  = 1 / totalMods;

    // E[exalts for hardest mod in open slot]
    const hardestPool = hardest.affix === "prefix" ? prefixPool : suffixPool;
    const hardestTarget = targetMods.find(t => t.modId === hardest.modId)!;
    const hardestAccW = acceptableWeight(hardestPool, hardest.modId, mode, hardestTarget);
    const eExalts     = hardestPool.totalWeight > 0 && hardestAccW > 0
      ? hardestPool.totalWeight / hardestAccW : Infinity;

    if (annulResult.probability > 0 && isFinite(eExalts)) {
      const eChaosPhase = (1 / annulResult.probability) * chaosExalt;
      const eAnnulPhase = (1 / pAnnulHits) * annulExalt;
      const eExaltPhase = eExalts; // in exalts (price = 1 exalt each)
      const totalExpected = eChaosPhase + eAnnulPhase + eExaltPhase;

      paths.push({
        id:          "annul-exalt",
        name:        "Chaos → Annul → Exalt",
        description: `Chaos until ${restTargets.length} mods hit, annul the wrong mod, then exalt "${hardest.name.slice(0, 35)}" into the open slot.`,
        probability:         annulResult.probability,
        expectedAttempts:    null,
        expectedCostExalt:   totalExpected,
        expectedCostDisplay: totalExpected >= divineExalt ? totalExpected / divineExalt : totalExpected,
        displayCurrency:     totalExpected >= divineExalt ? "divine" : "exalt",
        isAnalytical:        annulResult.isAnalytical,
        chartData:           [],
      });
    }
  }

  // ── Rank paths and mark best ───────────────────────────────────────────────
  const ranked = [...paths].sort((a, b) => {
    const ac = a.expectedCostExalt ?? Infinity;
    const bc = b.expectedCostExalt ?? Infinity;
    return ac - bc;
  });
  if (ranked.length > 0) ranked[0].isBest = true;

  return {
    mode,
    paths: ranked,
    modBreakdown,
    divineInExalt: divineExalt,
    chaosPriceExalt:  chaosExalt,
    annulPriceExalt:  annulExalt,
  };
}
