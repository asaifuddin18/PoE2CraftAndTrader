/**
 * Step 3 — craft-aggregate.
 * Ranks worker results, dedups by family, marks the best, re-runs the winner at
 * higher N for a sharper p99, then deletes the scratch object.
 *
 * Input:  { scratchKey, results: PatternResult[], jobs: PatternJob[], startedAt }
 * Output: SolverOutput
 */
import type { PatternJob, PatternResult, SolverOutput, ScratchBlob } from "../shared/types";
import { aggregate } from "../shared/aggregate";
import { runPolicy } from "../shared/runPolicy";
import { readScratch, deleteScratch } from "../shared/loaders";

const N_FINAL = 40_000;

interface AggregateInput {
  scratchKey: string;
  results: PatternResult[];
  jobs: PatternJob[];
  startedAt: number;
}

export async function handler(event: AggregateInput): Promise<SolverOutput> {
  const elapsed = Date.now() - (event.startedAt ?? Date.now());
  const out = aggregate(event.results ?? [], elapsed);

  // Scratch always exists on this (feasible) path — read it for the winner
  // refinement and to surface the price table to the UI.
  let blob: ScratchBlob | null = null;
  try { blob = await readScratch(event.scratchKey); } catch { /* ignore */ }

  if (out.feasible && out.best_pattern && blob) {
    // Re-run the winning pattern at higher N for a tighter tail.
    const winningJob = event.jobs.find(j => j.patternId === out.best_pattern!.pattern_id);
    if (winningJob) {
      try {
        const refined = runPolicy(winningJob, blob, N_FINAL);
        refined.is_best = true;
        out.best_pattern = refined;
        out.all_patterns = out.all_patterns.map(p => (p.pattern_id === refined.pattern_id ? refined : p));
      } catch { /* keep the N_RANK result if refinement fails */ }
    }
  }

  await deleteScratch(event.scratchKey);
  return { ...out, prices: blob?.prices, elapsed_ms: Date.now() - (event.startedAt ?? Date.now()) };
}
