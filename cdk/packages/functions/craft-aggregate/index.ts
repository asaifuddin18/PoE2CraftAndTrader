import type { EvaluationReference, EvaluationResult, OptimizerOutput, OutcomeBucket } from "../shared/types";
import { deleteScratch, readEvaluation, readPolicy, readScratch, writeTraceManifest } from "../shared/loaders";

interface AggregateInput {
  scratchKey: string;
  policyKey: string;
  results: EvaluationReference[];
  startedAt: number;
  executionName: string;
}

export async function handler(event: AggregateInput): Promise<OptimizerOutput> {
  const [scratch, policy] = await Promise.all([
    readScratch(event.scratchKey),
    readPolicy(event.policyKey),
  ]);
  const buckets = new Map<string, OutcomeBucket>();
  const actionCounts: Record<string, number> = {};
  let iterations = 0;
  let scoreSum = 0;
  let spendSum = 0;
  let maxSpend = 0;
  let overspendCount = 0;
  let fallbackCount = 0;

  for (const reference of event.results ?? []) {
    const result = await readEvaluation(reference.resultKey);
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

  const desiredModCount: Record<string, number> = {};
  for (const outcome of buckets.values()) {
    desiredModCount[String(outcome.mods.length)] = (desiredModCount[String(outcome.mods.length)] ?? 0) + outcome.count;
  }

  const allOutcomes = [...buckets.values()];
  const jointOutcomes = allOutcomes.map(outcome => {
    const tiers = outcome.mods.flatMap(mod => {
      const preferenceIndex = scratch.preferences.findIndex(preference => preference.group === mod.group);
      return preferenceIndex < 0 ? [] : [`${preferenceIndex.toString(36)}.${mod.tier.toString(36)}`];
    }).join(",");
    return `${tiers}=${outcome.count.toString(36)}`;
  }).join(";");
  const outcomes = allOutcomes
    .sort((a, b) => b.count - a.count || b.scoreSum / b.count - a.scoreSum / a.count)
    .slice(0, 20);
  const traceKey = await writeTraceManifest(event.executionName, {
    preferences: scratch.preferences,
    resultKeys: event.results.map(result => result.resultKey),
  });
  await Promise.all([
    deleteScratch(event.scratchKey),
    deleteScratch(event.policyKey),
  ]);
  return {
    feasible: true,
    budgetExalts: scratch.budgetExalts,
    iterations,
    expectedScore: iterations ? scoreSum / iterations : 0,
    expectedSpend: iterations ? spendSum / iterations : 0,
    fallbackCount,
    outcomes,
    jointOutcomes,
    traceKey,
    desiredModCount,
    policy: Object.values(policy.decisions).sort((a, b) => b.visits - a.visits).slice(0, 30),
    actionCounts,
    elapsed_ms: Date.now() - event.startedAt,
    prices: scratch.prices,
  };
}
