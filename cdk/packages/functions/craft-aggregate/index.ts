import type { EvaluationReference, EvaluationResult, OptimizerOutput, OutcomeBucket } from "../shared/types";
import { deleteScratch, readEvaluation, readPolicy, readScratch } from "../shared/loaders";

interface AggregateInput {
  scratchKey: string;
  policyKey: string;
  results: EvaluationReference[];
  startedAt: number;
}

export async function handler(event: AggregateInput): Promise<OptimizerOutput> {
  const [scratch, policy, results] = await Promise.all([
    readScratch(event.scratchKey),
    readPolicy(event.policyKey),
    Promise.all((event.results ?? []).map(result => readEvaluation(result.resultKey))),
  ]);
  const buckets = new Map<string, OutcomeBucket>();
  const actionCounts: Record<string, number> = {};
  let iterations = 0;
  let scoreSum = 0;
  let spendSum = 0;
  let maxSpend = 0;
  let overspendCount = 0;
  let fallbackCount = 0;

  for (const result of results) {
    iterations += result.iterations;
    scoreSum += result.scoreSum;
    spendSum += result.spendSum;
    maxSpend = Math.max(maxSpend, result.maxSpend);
    overspendCount += result.overspendCount;
    fallbackCount += result.fallbackCount;
    for (const [action, count] of Object.entries(result.actionCounts)) actionCounts[action] = (actionCounts[action] ?? 0) + count;
    for (const outcome of result.buckets) {
      const existing = buckets.get(outcome.signature) ?? { ...outcome, count: 0, scoreSum: 0, spendSum: 0 };
      existing.count += outcome.count;
      existing.scoreSum += outcome.scoreSum;
      existing.spendSum += outcome.spendSum;
      buckets.set(outcome.signature, existing);
    }
  }
  if (iterations !== 5_000) throw new Error(`Expected exactly 5,000 optimizer outcomes, received ${iterations}`);
  if (overspendCount || maxSpend > scratch.budgetExalts + 1e-9) {
    throw new Error(`Budget invariant violated: ${overspendCount} overspends, maximum spend ${maxSpend}`);
  }

  const modTierCounts: Record<string, Record<string, number>> = {};
  const desiredModCount: Record<string, number> = {};
  for (const preference of scratch.preferences) modTierCounts[preference.group] = { missing: 0 };
  for (const outcome of buckets.values()) {
    desiredModCount[String(outcome.mods.length)] = (desiredModCount[String(outcome.mods.length)] ?? 0) + outcome.count;
    for (const preference of scratch.preferences) {
      const mod = outcome.mods.find(candidate => candidate.group === preference.group);
      const key = mod ? `T${mod.tier}` : "missing";
      modTierCounts[preference.group][key] = (modTierCounts[preference.group][key] ?? 0) + outcome.count;
    }
  }

  await Promise.all([
    deleteScratch(event.scratchKey),
    deleteScratch(event.policyKey),
    ...(event.results ?? []).map(result => deleteScratch(result.resultKey)),
  ]);
  const allOutcomes = [...buckets.values()];
  const jointOutcomes = allOutcomes.map(outcome => ({
    tiers: scratch.preferences.map(preference => outcome.mods.find(mod => mod.group === preference.group)?.tier ?? 0),
    count: outcome.count,
  }));
  const outcomes = allOutcomes
    .sort((a, b) => b.count - a.count || b.scoreSum / b.count - a.scoreSum / a.count)
    .slice(0, 20);
  return {
    feasible: true,
    budgetExalts: scratch.budgetExalts,
    iterations,
    expectedScore: iterations ? scoreSum / iterations : 0,
    expectedSpend: iterations ? spendSum / iterations : 0,
    fallbackCount,
    outcomes,
    jointOutcomes,
    modTierCounts,
    desiredModCount,
    policy: Object.values(policy.decisions).sort((a, b) => b.visits - a.visits).slice(0, 30),
    actionCounts,
    elapsed_ms: Date.now() - event.startedAt,
    prices: scratch.prices,
  };
}
