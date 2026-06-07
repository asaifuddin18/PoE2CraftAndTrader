import type { Policy } from "../engine";
import type { CraftStep, ModPool, PatternJob, PriceTable, SolveRequest, TargetSpec } from "../types";

export interface StrategyBuildContext {
  pool: ModPool;
  target: TargetSpec;
  prices: PriceTable;
  baseId: string;
  ilvl: number;
}

export interface SolverStrategy {
  readonly id: PatternJob["strategyId"];
  readonly name: string;
  readonly description: string;

  isApplicable(req: SolveRequest, target: TargetSpec, pool: ModPool): boolean;
  createJob(req: SolveRequest, target: TargetSpec, pool: ModPool): PatternJob;
  buildPolicy(context: StrategyBuildContext): Policy;
  describe(context: StrategyBuildContext, meanCost: number): CraftStep[];
}
