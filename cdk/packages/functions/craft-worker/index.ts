import type { EvaluationJob } from "../shared/types";
import { evaluateBudgetPolicy } from "../shared/budgetOptimizer";
import { readPolicy, readScratch, writeEvaluation } from "../shared/loaders";

export async function handler(event: { scratchKey: string; policyKey: string; executionName: string; job: EvaluationJob }) {
  const [scratch, policy] = await Promise.all([readScratch(event.scratchKey), readPolicy(event.policyKey)]);
  const result = evaluateBudgetPolicy(scratch, policy, event.job.shard, event.job.iterations, event.job.seed);
  console.log(JSON.stringify({
    event: "optimizer_evaluation",
    shard: result.shard,
    iterations: result.iterations,
    fallbackCount: result.fallbackCount,
    budgetOverspends: result.overspendCount,
    maxSpend: result.maxSpend,
  }));
  return { shard: result.shard, resultKey: await writeEvaluation(event.executionName, result) };
}
