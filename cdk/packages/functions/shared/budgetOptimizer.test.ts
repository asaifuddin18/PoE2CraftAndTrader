import assert from "node:assert/strict";
import { budgetStateKey, evaluateBudgetPolicy, scoreItem, searchBudgetPolicy } from "./budgetOptimizer";
import type { ModEntry, ScratchBlob } from "./types";

const mod = (modId: string, tier: number, weight = 100): ModEntry => ({
  modId: `${modId}_t${tier}`,
  group: modId,
  gen_type: "prefix",
  tier,
  required_level: 1,
  weight,
  name: modId,
});
const t1 = mod("life", 1);
const t2 = mod("life", 2);
const suffix: ModEntry = { ...mod("resistance", 1), gen_type: "suffix" };
const empty = { rarity: "normal" as const, prefixes: [], suffixes: [], fractured_mod_ids: new Set<string>(), corrupted: false };
const preference = { modId: "life", group: "life", name: "life", affix: "prefix" as const, weight: 100, eligibleTiers: [1, 2] };
const scratch: ScratchBlob = {
  pool: { prefixes: [t1, t2], suffixes: [suffix] },
  prices: { transmute: 1, greater_transmute: 2, perfect_transmute: 3, alch: 10 },
  preferences: [preference],
  startingItem: empty,
  budgetExalts: 0.5,
  ilvl: 84,
  baseId: "test",
};

assert.equal(scoreItem({ ...empty, rarity: "rare", prefixes: [t1] }, [preference]), 100);
assert.equal(scoreItem({ ...empty, rarity: "rare", prefixes: [t2] }, [preference]), 50);
assert.ok(budgetStateKey(empty, 1).endsWith("b:1"));

const choiceMods = Array.from({ length: 8 }, (_, index): ModEntry => ({
  ...mod(`choice_${index}`, 1),
  gen_type: index < 3 ? "prefix" : "suffix",
}));
const choices = choiceMods.map(entry => ({
  modId: entry.modId,
  group: entry.group,
  name: entry.name,
  affix: entry.gen_type,
  weight: 10,
  eligibleTiers: [1],
}));
assert.equal(scoreItem({
  ...empty,
  rarity: "rare",
  prefixes: choiceMods.slice(0, 3),
  suffixes: choiceMods.slice(3, 6),
}, choices), 60);

const policy = searchBudgetPolicy(scratch, 123);
const first = evaluateBudgetPolicy(scratch, policy, 0, 500, 456);
const second = evaluateBudgetPolicy(scratch, policy, 0, 500, 456);
assert.deepEqual(first, second);
assert.equal(first.iterations, 500);
assert.equal(first.spendSum, 0);
assert.equal(first.maxSpend, 0);
assert.equal(first.overspendCount, 0);
assert.equal(first.buckets.reduce((sum, bucket) => sum + bucket.count, 0), 500);
assert.equal(Object.keys(first.actionCounts).length, 0);

const corruptedScratch = {
  ...scratch,
  budgetExalts: 100,
  startingItem: { ...empty, rarity: "rare" as const, prefixes: [t1], corrupted: true },
};
const corrupted = evaluateBudgetPolicy(corruptedScratch, { decisions: {}, searchIterations: 0, searchDurationMs: 0 }, 0, 10, 1);
assert.equal(corrupted.spendSum, 0);
assert.equal(corrupted.scoreSum, 1_000);

const fiveThousand = Array.from({ length: 10 }, (_, shard) =>
  evaluateBudgetPolicy(corruptedScratch, { decisions: {}, searchIterations: 0, searchDurationMs: 0 }, shard, 500, shard + 1),
);
assert.equal(fiveThousand.reduce((sum, result) => sum + result.iterations, 0), 5_000);
assert.equal(fiveThousand.reduce((sum, result) => sum + result.buckets.reduce((n, bucket) => n + bucket.count, 0), 0), 5_000);
assert.ok(fiveThousand.every(result => result.spendSum <= corruptedScratch.budgetExalts * result.iterations));
assert.ok(fiveThousand.every(result => result.maxSpend <= corruptedScratch.budgetExalts));
assert.equal(fiveThousand.reduce((sum, result) => sum + result.overspendCount, 0), 0);

console.log("Budget optimizer tests passed");
