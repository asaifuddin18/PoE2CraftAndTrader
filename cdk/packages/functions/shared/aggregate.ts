/**
 * Aggregate worker results: dedup by pattern family, rank by mean cost, mark best.
 * Ported from craft-engine.ts solve()'s tail (lines 802-824).
 */
import type { PatternResult, SolverOutput } from "./types";

export function aggregate(results: PatternResult[], elapsed_ms: number): SolverOutput {
  if (results.length === 0) {
    return { feasible: false, error: "No applicable patterns found", best_pattern: null, all_patterns: [], elapsed_ms };
  }

  // Keep the cheapest instance per pattern family (strip the _t{threshold} suffix).
  const seen = new Map<string, PatternResult>();
  for (const r of results) {
    const family = r.pattern_id.replace(/_t\d+$/, "");
    if (!seen.has(family) || r.cost.mean < seen.get(family)!.cost.mean) seen.set(family, r);
  }

  const deduped = [...seen.values()].sort((a, b) => a.cost.mean - b.cost.mean);
  deduped.forEach(r => (r.is_best = false));
  deduped[0].is_best = true;

  return {
    feasible:     true,
    best_pattern: deduped[0],
    all_patterns: deduped,
    elapsed_ms,
  };
}
