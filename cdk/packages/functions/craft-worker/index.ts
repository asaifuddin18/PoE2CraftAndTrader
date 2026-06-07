/**
 * Step 2 — craft-worker (Step Functions Map: one invocation per solver strategy).
 * Reads the scratch blob, runs Monte Carlo for one adaptive policy, and returns
 * the existing PatternResult API shape.
 *
 * Input:  { scratchKey, job }
 * Output: PatternResult
 */
import type { PatternJob, PatternResult, ScratchBlob } from "../shared/types";
import { runPolicy } from "../shared/runPolicy";
import { readScratch } from "../shared/loaders";

// Memoize the scratch blob across warm invocations of the same execution.
let cacheKey: string | null = null;
let cacheBlob: ScratchBlob | null = null;

interface WorkerInput { scratchKey: string; job: PatternJob; }

export async function handler(event: WorkerInput): Promise<PatternResult> {
  if (cacheKey !== event.scratchKey) {
    cacheBlob = await readScratch(event.scratchKey);
    cacheKey = event.scratchKey;
  }
  // Sets were serialized to arrays — engine only reads .fractured_mod_ids via Set ops,
  // but the pool blob carries no Sets, so no rehydration is needed here.
  return runPolicy(event.job, cacheBlob!);
}
