export interface OutcomeMod {
  group: string;
  modId: string;
  name: string;
  affix: "prefix" | "suffix";
  tier: number;
}

export interface OutcomeBucket {
  signature: string;
  count: number;
  scoreSum: number;
  spendSum: number;
  mods: OutcomeMod[];
}

export interface PolicyDecision {
  stateKey: string;
  actionId: string;
  actionName: string;
  visits: number;
  expectedScore: number;
}

export interface OptimizerOutput {
  feasible: boolean;
  error?: string;
  budgetExalts: number;
  iterations: number;
  expectedScore: number;
  expectedSpend: number;
  fallbackCount: number;
  outcomes: OutcomeBucket[];
  jointOutcomes: string;
  modTierCounts: Record<string, Record<string, number>>;
  desiredModCount: Record<string, number>;
  policy: PolicyDecision[];
  actionCounts: Record<string, number>;
  elapsed_ms: number;
  prices?: Record<string, number>;
}
