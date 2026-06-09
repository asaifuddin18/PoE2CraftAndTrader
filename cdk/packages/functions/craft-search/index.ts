import { readScratch, writePolicy } from "../shared/loaders";
import { searchBudgetPolicy } from "../shared/budgetOptimizer";

export async function handler(event: { scratchKey: string; executionName: string }) {
  const scratch = await readScratch(event.scratchKey);
  const policy = searchBudgetPolicy(scratch);
  const policyKey = await writePolicy(event.executionName, policy);
  console.log(JSON.stringify({ event: "optimizer_search", durationMs: policy.searchDurationMs, decisions: Object.keys(policy.decisions).length }));
  return { policyKey, searchDurationMs: policy.searchDurationMs, decisions: Object.keys(policy.decisions).length };
}
