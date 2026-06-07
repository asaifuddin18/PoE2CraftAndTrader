/**
 * Step 3 — craft-aggregate.
 * Ranks solver results, attaches prices, and deletes the scratch object.
 *
 * Input:  { scratchKey, results: PatternResult[], jobs: PatternJob[], startedAt }
 * Output: SolverOutput
 */
import type { PatternJob, PatternResult, SolverOutput, ScratchBlob } from "../shared/types";
import { aggregate } from "../shared/aggregate";
import { readScratch, deleteScratch } from "../shared/loaders";

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

  await deleteScratch(event.scratchKey);
  return { ...out, prices: blob?.prices, elapsed_ms: Date.now() - (event.startedAt ?? Date.now()) };
}
