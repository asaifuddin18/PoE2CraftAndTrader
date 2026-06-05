/**
 * Step 1 — craft-prepare.
 * Loads the mod pool + prices, checks feasibility, enumerates candidate pattern
 * jobs, and writes the resolved {pool,prices,target} blob to S3 scratch.
 *
 * Input:  SolveRequest + { executionName }
 * Output: { feasible, error?, scratchKey?, jobs?, ilvl }
 */
import type { SolveRequest, PatternJob } from "../shared/types";
import { build_target_spec, check_feasibility } from "../shared/engine";
import { enumerate_candidates } from "../shared/patterns";
import { loadPool, loadPrices, writeScratch } from "../shared/loaders";

interface PrepareInput extends SolveRequest { executionName: string; }
interface PrepareOutput {
  feasible: boolean;
  error?: string;
  scratchKey?: string;
  jobs?: PatternJob[];
  ilvl: number;
}

export async function handler(event: PrepareInput): Promise<PrepareOutput> {
  const ilvl = Number(event.ilvl) || 84;
  const pool = await loadPool(event.baseId, ilvl);

  if (pool.prefixes.length + pool.suffixes.length === 0) {
    return { feasible: false, error: `No mod pool found for base "${event.baseId}" at ilvl ${ilvl}`, ilvl };
  }

  const prices = await loadPrices();
  const merged = { ...prices, ...(event.priceOverrides ?? {}) };

  const target = build_target_spec(event, pool);
  const err = check_feasibility(target, pool, ilvl);
  if (err) return { feasible: false, error: err, ilvl };

  const jobs = enumerate_candidates(event, target, pool);
  if (jobs.length === 0) return { feasible: false, error: "No applicable patterns found", ilvl };

  const scratchKey = await writeScratch(event.executionName, { pool, prices: merged, target, ilvl });
  return { feasible: true, scratchKey, jobs, ilvl };
}
