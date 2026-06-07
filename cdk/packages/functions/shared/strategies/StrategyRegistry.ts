import type { PatternJob, SolveRequest, TargetSpec, ModPool } from "../types";
import type { SolverStrategy } from "./SolverStrategy";
import { RareRefinementStrategy } from "./RareRefinementStrategy";

const strategies: readonly SolverStrategy[] = [new RareRefinementStrategy()];

export function enumerateStrategies(req: SolveRequest, target: TargetSpec, pool: ModPool): PatternJob[] {
  return strategies.filter(strategy => strategy.isApplicable(req, target, pool))
    .map(strategy => strategy.createJob(req, target, pool));
}

export function strategyFor(job: PatternJob): SolverStrategy {
  const strategy = strategies.find(candidate => candidate.id === job.strategyId);
  if (!strategy) throw new Error(`Unknown solver strategy: ${job.strategyId}`);
  return strategy;
}
