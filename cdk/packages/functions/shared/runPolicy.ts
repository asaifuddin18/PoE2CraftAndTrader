/**
 * Run one solver strategy job and produce the existing PatternResult API shape.
 */
import type { PatternJob, PatternResult, ScratchBlob, ModPool, TargetSpec, PriceTable } from "./types";
import { Policy, monte_carlo, summarize, price_basket } from "./engine";
import { strategyFor } from "./strategies/StrategyRegistry";

/** Average currency basket over a small sample (for display). */
function mean_basket(
  policy: Policy, pool: ModPool, target: TargetSpec, prices: PriceTable, runs: number, seed: number,
): Record<string, number> {
  let s = seed >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0x100000000; };
  const totals: Record<string, number> = {};
  for (let i = 0; i < runs; i++) {
    const basket = policy(rng, pool, target, prices);
    for (const [k, v] of Object.entries(basket)) totals[k] = (totals[k] ?? 0) + v;
  }
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(totals)) out[k] = Math.round((v / runs) * 100) / 100;
  return out;
}

export function runPolicy(job: PatternJob, scratch: ScratchBlob, N?: number): PatternResult {
  const { pool, prices, target, baseId, ilvl } = scratch;
  const strategy = strategyFor(job);
  const context = { pool, prices, target, baseId, ilvl };
  const policy = strategy.buildPolicy(context);
  const iterations = N ?? job.N;

  const cost = monte_carlo(policy, pool, target, prices, iterations, job.seed);
  const basket_mean = mean_basket(policy, pool, target, prices, Math.min(30, iterations), job.seed ^ 0x9e3779b9);
  const steps = strategy.describe(context, cost.mean);

  return {
    pattern_id:   job.patternId,
    pattern_name: job.patternName,
    description:  job.description,
    cost,
    basket_mean,
    steps,
    is_best:      false,
  };
}

export { summarize, price_basket };
