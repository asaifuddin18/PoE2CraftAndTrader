/**
 * Shared types for the PoE2 craft solver — ported from web/src/lib/craft-engine.ts
 * and extended with a cost-vs-success CDF curve and structured steps.
 *
 * These types are the contract between the Step Functions Lambdas
 * (prepare → worker → aggregate) and the frontend renderer.
 */

// ── Mod / target / item state (spec §1) ──────────────────────────────────────

export interface ModEntry {
  modId:          string;
  group:          string;             // exclusivity group (one per group per item)
  gen_type:       "prefix" | "suffix";
  tier:           number;             // T1 = best (lowest number)
  required_level: number;             // ilvl gate
  weight:         number;             // spawn weight for this base
  name:           string;
  tags?:          string[];
  desecrated?:    boolean;
  hidden?:        boolean;
  abyssFamily?:   "Ulaman" | "Amanamu" | "Kurgal";
  guaranteedAbyssFamily?: "Ulaman" | "Amanamu" | "Kurgal";
  putrefiedDesecration?: boolean;
  desecrationTier?: "gnawed" | "preserved" | "ancient";
}

export type CatalystType =
  | "life" | "mana" | "defences" | "physical" | "fire" | "cold"
  | "lightning" | "chaos" | "attack" | "caster" | "speed" | "attribute";

export interface CatalystQuality {
  type: CatalystType;
  amount: number;
  maximum: number;
}

export interface TargetMod {
  group:    string;                   // exclusivity group that must be satisfied
  min_tier: number;                   // accept tier <= min_tier
  gen_type: "prefix" | "suffix";
  name:     string;                   // for display
}

export interface TargetSpec {
  required_mods: TargetMod[];
  k_required:    number;              // need >= k of the listed mods simultaneously
}

export interface ItemState {
  rarity:            "normal" | "magic" | "rare";
  prefixes:          ModEntry[];
  suffixes:          ModEntry[];
  fractured_mod_ids: Set<string>;
  corrupted:         boolean;
  catalyst?:         CatalystQuality;
}

export type OmenType =
  | "sinistral" | "dextral" | "greater" | "greater_annulment" | "whittling"
  | "sinistral_erasure" | "dextral_erasure" | "sinistral_annulment" | "dextral_annulment"
  | "sinistral_crystallisation" | "dextral_crystallisation"
  | "light"
  | null;

export interface ModPool {
  prefixes: ModEntry[];
  suffixes: ModEntry[];
}

export interface CraftModPools {
  normal: ModPool;
  desecration: ModPool;
}

export interface PriceTable {
  [currency: string]: number;         // price in exalts
}

// ── Raw mod shape as stored in DynamoDB / ideal-item-data.json ────────────────

export interface RawMod {
  modId:     string;
  name:      string;
  affix:     string;                  // "prefix" | "suffix"
  modgroups: string[];
  tags:      string[];
  statId?:   string | null;
  tiers:     { tier: number; ilvl: number; weight: number; values: unknown[] }[];
}

// ── Solver I/O ────────────────────────────────────────────────────────────────

export interface SolveRequest {
  baseId: string;
  ilvl: number;
  budget: { amount: number; unit: "exalt" | "divine" };
  startingItem: SerializedItemState;
  preferences: WeightedModPreference[];
  priceOverrides?: PriceTable;
  mode?: "exact" | "minTier";
  k_required?: number;
  targetMods?: { modId: string; name: string; affix: string; tier: number; minTier: number; group?: string }[];
}

export interface SerializedItemState {
  rarity: ItemState["rarity"];
  prefixes: { modId: string; tier: number; fractured?: boolean }[];
  suffixes: { modId: string; tier: number; fractured?: boolean }[];
  corrupted: boolean;
  catalyst?: CatalystQuality;
}

export interface WeightedModPreference {
  modId: string;
  group?: string;
  name: string;
  affix: "prefix" | "suffix";
  weight: number;
}

export interface ResolvedPreference extends WeightedModPreference {
  group: string;
  eligibleTiers: number[];
}

export interface PolicyDecision {
  stateKey: string;
  actionId: string;
  actionName: string;
  visits: number;
  expectedScore: number;
}

export interface LearnedPolicy {
  decisions: Record<string, PolicyDecision>;
  searchIterations: number;
  searchDurationMs: number;
}

export interface EvaluationJob {
  shard: number;
  iterations: number;
  seed: number;
}

export interface ScratchBlob {
  pool: ModPool;
  desecrationPool: ModPool;
  prices: PriceTable;
  preferences: ResolvedPreference[];
  startingItem: ItemState;
  budgetExalts: number;
  ilvl: number;
  baseId: string;
}

export interface OutcomeBucket {
  signature: string;
  count: number;
  scoreSum: number;
  spendSum: number;
  mods: { group: string; modId: string; name: string; affix: "prefix" | "suffix"; tier: number }[];
}

export interface SimulationTraceStep {
  action: string;
  cost: PriceTable;
  spendAfter: number;
  events: { type: string; message: string; details?: Record<string, unknown> }[];
  itemAfter: SimulationTraceItem;
}

export interface SimulationTraceItem {
  rarity: ItemState["rarity"];
  corrupted: boolean;
  prefixes: ModEntry[];
  suffixes: ModEntry[];
  fracturedModIds: string[];
  catalyst?: CatalystQuality;
}

export interface SimulationTrace {
  id: string;
  score: number;
  spend: number;
  steps: SimulationTraceStep[];
  finalItem: SimulationTraceItem;
}

export interface TraceManifest {
  preferences: ResolvedPreference[];
  resultKeys: string[];
}

export interface EvaluationResult {
  shard: number;
  iterations: number;
  scoreSum: number;
  spendSum: number;
  maxSpend: number;
  overspendCount: number;
  fallbackCount: number;
  buckets: OutcomeBucket[];
  actionCounts: Record<string, number>;
  traces: SimulationTrace[];
}

export interface EvaluationReference {
  shard: number;
  resultKey: string;
}

export interface OptimizerOutput {
  feasible: boolean;
  error?: string;
  budgetExalts: number;
  iterations: number;
  expectedScore: number;
  expectedSpend: number;
  fallbackCount: number;
  outcomes: OutcomeBucket[];
  jointOutcomes: string;
  traceKey: string;
  desiredModCount: Record<string, number>;
  policy: PolicyDecision[];
  actionCounts: Record<string, number>;
  elapsed_ms: number;
  prices?: PriceTable;
}

// Legacy strategy primitives retained while the audited ingredient compatibility
// helpers are still used by rule tests.
export interface CdfPoint { cost: number; cumProb: number; }
export interface CostSummary {
  mean: number; p50: number; p90: number; p99: number; std: number; n: number; costCdf: CdfPoint[];
}
export interface CraftStep {
  action: string; currency: string; probability: number; expectedCost: number; branchCondition?: string;
}
export interface PatternResult {
  pattern_id: string; pattern_name: string; description: string; cost: CostSummary;
  basket_mean: Record<string, number>; steps: CraftStep[]; is_best: boolean;
}
export interface SolverOutput {
  feasible: boolean; error?: string; best_pattern: PatternResult | null;
  all_patterns: PatternResult[]; elapsed_ms: number; prices?: PriceTable;
}
export type StrategyId = "rare_refinement";
export interface PatternJob {
  patternId: string; patternName: string; description: string; strategyId: StrategyId; N: number; seed: number;
}
