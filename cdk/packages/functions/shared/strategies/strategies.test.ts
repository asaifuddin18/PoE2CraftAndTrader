import assert from "node:assert/strict";
import { empty_normal, price_basket } from "../engine";
import type { ModEntry, ModPool, PriceTable, SolveRequest, TargetSpec } from "../types";
import { RareRefinementStrategy } from "./RareRefinementStrategy";
import { canonicalStateKey } from "./StateCanonicalizer";
import { enumerateStrategies } from "./StrategyRegistry";
import { optimisticRemainingCost } from "./WeightHeuristic";

function mod(modId: string, gen_type: "prefix" | "suffix", weight: number): ModEntry {
  return { modId, group: modId, gen_type, tier: 1, required_level: 1, weight, name: modId };
}

const targetPrefix = mod("target_prefix", "prefix", 1_000);
const rarePrefix = mod("rare_prefix", "prefix", 1);
const targetSuffix = mod("target_suffix", "suffix", 1_000);
const pool: ModPool = {
  prefixes: [targetPrefix, rarePrefix, mod("p2", "prefix", 100), mod("p3", "prefix", 100)],
  suffixes: [targetSuffix, mod("s1", "suffix", 100), mod("s2", "suffix", 100), mod("s3", "suffix", 100)],
};
const prices: PriceTable = {
  white_base: 1, alch: 1, exalt: 1, greater_exalt: 2, perfect_exalt: 3,
  chaos: 1, greater_chaos: 2, perfect_chaos: 3, annul: 1,
  omen_greater: 1, omen_sinistral: 1, omen_dextral: 1, omen_whittling: 1,
  omen_sinistral_erasure: 1, omen_dextral_erasure: 1,
  omen_greater_annulment: 1, omen_sinistral_annulment: 1, omen_dextral_annulment: 1,
};
const target: TargetSpec = {
  required_mods: [{ group: targetPrefix.group, min_tier: 1, gen_type: "prefix", name: targetPrefix.name }],
  k_required: 1,
};
const request: SolveRequest = {
  baseId: "test",
  ilvl: 84,
  mode: "minTier",
  k_required: 1,
  targetMods: [{ modId: targetPrefix.modId, name: targetPrefix.name, affix: "prefix", tier: 1, minTier: 1 }],
};

const jobs = enumerateStrategies(request, target, pool);
assert.equal(jobs.length, 1);
assert.equal(jobs[0].strategyId, "rare_refinement");

const normal = empty_normal();
assert.equal(canonicalStateKey(normal, target), canonicalStateKey({ ...normal, prefixes: [] }, target));

const commonTarget: TargetSpec = {
  required_mods: [{ group: targetPrefix.group, min_tier: 1, gen_type: "prefix", name: targetPrefix.name }],
  k_required: 1,
};
const rareTarget: TargetSpec = {
  required_mods: [{ group: rarePrefix.group, min_tier: 1, gen_type: "prefix", name: rarePrefix.name }],
  k_required: 1,
};
assert.ok(
  optimisticRemainingCost(normal, rareTarget, pool, prices) >
  optimisticRemainingCost(normal, commonTarget, pool, prices),
);
const lowTierTargetState = {
  ...normal,
  rarity: "rare" as const,
  prefixes: [{ ...targetPrefix, tier: 2 }],
};
assert.ok(Number.isFinite(optimisticRemainingCost(lowTierTargetState, commonTarget, pool, prices)));

const strategy = new RareRefinementStrategy();
const policy = strategy.buildPolicy({ pool, target, prices });
let seed = 123;
const basket = policy(() => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}, pool, target, prices);
assert.equal(basket.alteration, undefined);
assert.ok((basket.white_base ?? 0) >= 1);
assert.ok((basket.alch ?? 0) >= 1);
assert.equal(price_basket({ solver_failure: 1 }, prices), 1_000_000_000);

console.log("Stochastic strategy tests passed");
