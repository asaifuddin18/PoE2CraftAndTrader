import { all_mods, is_satisfied, present_groups } from "../engine";
import type { ItemState, ModPool, PriceTable, TargetSpec } from "../types";

const MIN_COST = 0.0001;

export function optimisticRemainingCost(
  state: ItemState,
  target: TargetSpec,
  pool: ModPool,
  prices: PriceTable,
): number {
  if (is_satisfied(state, target)) return 0;

  const present = present_groups(state);
  const missing = target.required_mods.filter(targetMod =>
    !all_mods(state).some(mod => mod.group === targetMod.group && mod.tier <= targetMod.min_tier),
  );
  const needed = Math.max(0, target.k_required - (target.required_mods.length - missing.length));
  const cheapestRoll = Math.max(MIN_COST, Math.min(
    prices.exalt ?? Number.POSITIVE_INFINITY,
    prices.greater_exalt ?? Number.POSITIVE_INFINITY,
    prices.perfect_exalt ?? Number.POSITIVE_INFINITY,
    prices.chaos ?? Number.POSITIVE_INFINITY,
    prices.greater_chaos ?? Number.POSITIVE_INFINITY,
    prices.perfect_chaos ?? Number.POSITIVE_INFINITY,
  ));

  const estimates = missing.map(targetMod => {
    const candidates = (targetMod.gen_type === "prefix" ? pool.prefixes : pool.suffixes)
      .filter(mod => !present.has(mod.group) || mod.group === targetMod.group);
    const totalWeight = candidates.reduce((sum, mod) => sum + mod.weight, 0);
    const targetWeight = candidates
      .filter(mod => mod.group === targetMod.group && mod.tier <= targetMod.min_tier)
      .reduce((sum, mod) => sum + mod.weight, 0);
    return targetWeight > 0 ? cheapestRoll / (targetWeight / totalWeight) : Number.POSITIVE_INFINITY;
  });

  return estimates.sort((a, b) => a - b).slice(0, needed).reduce((sum, estimate) => sum + estimate, 0);
}
