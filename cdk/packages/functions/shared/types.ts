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
  baseId:     string;                 // mod pool key (DynamoDB PK=MODS#{baseId})
  ilvl:       number;
  mode:       "exact" | "minTier";
  k_required: number;
  targetMods: {
    modId:   string;
    name:    string;
    affix:   string;
    tier:    number;
    minTier: number;
    group?:  string;
  }[];
  priceOverrides?: PriceTable;
  // Optional end-game essence anchor for the C2 pattern.
  essenceId?: string;
}

/** A single point on the cost-vs-probability-of-success curve. */
export interface CdfPoint {
  cost:    number;
  cumProb: number;                    // P(total spend <= cost)
}

export interface CostSummary {
  mean:   number;
  p50:    number;
  p90:    number;
  p99:    number;
  std:    number;
  n:      number;
  costCdf: CdfPoint[];                // ~60-point downsampled empirical CDF
}

/** Structured crafting step (spec / ARCHITECTURE §6.4, REQ-CRAFT-07). */
export interface CraftStep {
  action:          string;            // human-readable instruction
  currency:        string;            // currency consumed (or "" for base/setup)
  probability:     number;            // chance this step lands as intended (0..1)
  expectedCost:    number;            // expected spend for this step, in exalts
  branchCondition?: string;           // e.g. "if anchor hits → next, else repeat"
}

export interface PatternResult {
  pattern_id:   string;
  pattern_name: string;
  description:  string;
  cost:         CostSummary;
  basket_mean:  Record<string, number>;
  steps:        CraftStep[];
  is_best:      boolean;
}

export interface SolverOutput {
  feasible:     boolean;
  error?:       string;
  best_pattern: PatternResult | null;
  all_patterns: PatternResult[];
  elapsed_ms:   number;
  prices?:      PriceTable;            // attached by aggregate for UI display
}

// ── Job descriptors (Step Functions Map fan-out) ──────────────────────────────

export type PolicyKind = "B3" | "A1" | "C2" | "E1";

export interface PatternJob {
  patternId:    string;              // e.g. "B3_t15"
  patternName:  string;
  description:  string;
  policyKind:   PolicyKind;
  N:            number;              // Monte-Carlo iterations
  seed:         number;
  params: {
    restart_threshold: number;
    whittling?:        boolean;       // B3
    anchor_groups?:    string[];      // A1 anchor mod groups
    essence?:          { id: string; baseId: string }; // C2
    anchor_group?:     string;        // E1 group to fracture
  };
}

/** S3 scratch blob written by craft-prepare, read by workers + aggregate. */
export interface ScratchBlob {
  pool:   ModPool;
  prices: PriceTable;
  target: TargetSpec;
  ilvl:   number;
}
