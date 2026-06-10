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
  traceKey: string;
  desiredModCount: Record<string, number>;
  policy: PolicyDecision[];
  actionCounts: Record<string, number>;
  elapsed_ms: number;
  prices?: Record<string, number>;
}

export interface SimulationTraceStep {
  action: string;
  cost: Record<string, number>;
  spendAfter: number;
  events: { type: string; message: string; details?: Record<string, unknown> }[];
}

export interface SimulationTraceMod {
  modId: string;
  group: string;
  gen_type: "prefix" | "suffix";
  tier: number;
  name: string;
  desecrated?: boolean;
  hidden?: boolean;
}

export interface SimulationTrace {
  id: string;
  score: number;
  spend: number;
  steps: SimulationTraceStep[];
  finalItem: {
    rarity: "normal" | "magic" | "rare";
    corrupted: boolean;
    prefixes: SimulationTraceMod[];
    suffixes: SimulationTraceMod[];
    fracturedModIds: string[];
    catalyst?: { type: string; amount: number; maximum: number };
  };
}
