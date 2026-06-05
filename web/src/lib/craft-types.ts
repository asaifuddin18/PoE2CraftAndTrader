/**
 * Render-only types for the craft solver UI.
 * Mirrors the SolverOutput contract returned by the AWS craft API
 * (cdk/packages/functions/shared/types.ts). Keep the two in sync.
 */

export interface CdfPoint {
  cost:    number;
  cumProb: number; // P(total spend <= cost)
}

export interface CostSummary {
  mean:    number;
  p50:     number;
  p90:     number;
  p99:     number;
  std:     number;
  n:       number;
  costCdf: CdfPoint[];
}

export interface CraftStep {
  action:           string;
  currency:         string;
  probability:      number;
  expectedCost:     number;
  branchCondition?: string;
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
  prices?:      Record<string, number>;
}
