import type {
  EvaluationJob,
  ItemState,
  ModEntry,
  ResolvedPreference,
  SerializedItemState,
  SolveRequest,
} from "../shared/types";
import { loadPool, loadPrices, writeScratch } from "../shared/loaders";

interface PrepareInput extends SolveRequest { executionName: string; }

export async function handler(event: PrepareInput) {
  const ilvl = Number(event.ilvl) || 84;
  const pools = await loadPool(event.baseId, ilvl);
  if (!pools.normal.prefixes.length && !pools.normal.suffixes.length) return infeasible(`No mod pool found for base "${event.baseId}"`, ilvl);
  if (!event.preferences?.length) return infeasible("At least one weighted modifier preference is required", ilvl);
  if (!event.budget || !(Number(event.budget.amount) > 0)) return infeasible("Budget must be greater than zero", ilvl);

  const prices = { ...(await loadPrices()), ...(event.priceOverrides ?? {}) };
  const budgetExalts = Number(event.budget.amount) * (event.budget.unit === "divine" ? prices.divine : 1);
  const preferences = resolvePreferences(event.preferences, pools.desecration);
  if (typeof preferences === "string") return infeasible(preferences, ilvl);
  const startingItem = resolveStartingItem(event.startingItem, pools.desecration);
  if (typeof startingItem === "string") return infeasible(startingItem, ilvl);

  const jobs: EvaluationJob[] = Array.from({ length: 10 }, (_, shard) => ({
    shard,
    iterations: 500,
    seed: (0x9e3779b9 ^ Math.imul(shard + 1, 0x85ebca6b)) >>> 0,
  }));
  const scratchKey = await writeScratch(event.executionName, {
    pool: pools.normal,
    desecrationPool: pools.desecration,
    prices,
    preferences,
    startingItem,
    budgetExalts,
    ilvl,
    baseId: event.baseId,
  });
  return { feasible: true, scratchKey, jobs, ilvl, executionName: event.executionName };
}

function resolvePreferences(input: SolveRequest["preferences"], pool: { prefixes: ModEntry[]; suffixes: ModEntry[] }): ResolvedPreference[] | string {
  const out: ResolvedPreference[] = [];
  const seen = new Set<string>();
  for (const preference of input) {
    const candidates = [...pool.prefixes, ...pool.suffixes].filter(mod => mod.modId === preference.modId);
    if (!candidates.length) return `Preferred modifier "${preference.name}" cannot roll on this base at this item level`;
    const group = preference.group ?? candidates[0].group;
    if (seen.has(group)) return `Modifier group "${group}" was selected more than once`;
    seen.add(group);
    out.push({
      ...preference,
      group,
      affix: candidates[0].gen_type,
      weight: Math.max(1, Math.min(100, Number(preference.weight) || 1)),
      eligibleTiers: [...new Set(candidates.map(mod => mod.tier))].sort((a, b) => a - b),
    });
  }
  return out;
}

function resolveStartingItem(input: SerializedItemState | undefined, pool: { prefixes: ModEntry[]; suffixes: ModEntry[] }): ItemState | string {
  const source = input ?? { rarity: "normal", prefixes: [], suffixes: [], corrupted: false };
  const prefixes = resolveMods(source.prefixes ?? [], pool.prefixes);
  const suffixes = resolveMods(source.suffixes ?? [], pool.suffixes);
  if (typeof prefixes === "string") return prefixes;
  if (typeof suffixes === "string") return suffixes;
  const max = source.rarity === "normal" ? 0 : source.rarity === "magic" ? 1 : 3;
  if (prefixes.length > max || suffixes.length > max) return `${source.rarity} item has too many affixes`;
  const fractured = [...(source.prefixes ?? []), ...(source.suffixes ?? [])].filter(mod => mod.fractured);
  if (fractured.length > 1) return "An item can have at most one fractured affix";
  return {
    rarity: source.rarity,
    prefixes,
    suffixes,
    fractured_mod_ids: new Set(fractured.map(mod => mod.modId)),
    corrupted: Boolean(source.corrupted),
    catalyst: source.catalyst,
  };
}

function resolveMods(input: SerializedItemState["prefixes"], pool: ModEntry[]): ModEntry[] | string {
  const out: ModEntry[] = [];
  const groups = new Set<string>();
  for (const selected of input) {
    const mod = pool.find(candidate => candidate.modId === selected.modId && candidate.tier === Number(selected.tier));
    if (!mod) return `Starting modifier "${selected.modId}" at T${selected.tier} is invalid`;
    if (groups.has(mod.group)) return `Starting item contains duplicate modifier group "${mod.group}"`;
    groups.add(mod.group);
    out.push(mod);
  }
  return out;
}

function infeasible(error: string, ilvl: number) {
  return { feasible: false, error, ilvl };
}
