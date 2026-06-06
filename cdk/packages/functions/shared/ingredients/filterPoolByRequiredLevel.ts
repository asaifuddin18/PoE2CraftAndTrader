import type { ModPool } from "../types";

export function filterPoolByRequiredLevel(pool: ModPool, minimumRequiredLevel: number): ModPool {
  if (minimumRequiredLevel <= 0) return pool;
  return {
    prefixes: pool.prefixes.filter(mod => mod.required_level >= minimumRequiredLevel),
    suffixes: pool.suffixes.filter(mod => mod.required_level >= minimumRequiredLevel),
  };
}
