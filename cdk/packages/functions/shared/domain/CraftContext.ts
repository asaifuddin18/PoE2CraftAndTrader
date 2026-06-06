import type { ModPool } from "../types";

export interface CraftContext {
  pool: ModPool;
  rng: () => number;
}
