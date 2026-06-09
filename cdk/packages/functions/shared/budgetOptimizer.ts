import { CraftedItem } from "./domain/CraftedItem";
import type { CraftContext } from "./domain/CraftContext";
import { EssenceCatalog } from "./domain/EssenceCatalog";
import {
  AlchemyOrb,
  AugmentationOrb,
  GreaterAugmentationOrb,
  GreaterRegalOrb,
  GreaterTransmutationOrb,
  PerfectAugmentationOrb,
  PerfectRegalOrb,
  PerfectTransmutationOrb,
  RegalOrb,
  TransmutationOrb,
} from "./ingredients";
import { generateRefinementActions, type RefinementAction } from "./strategies/ContextualCraftActions";
import type {
  EvaluationResult,
  ItemState,
  LearnedPolicy,
  ModEntry,
  OutcomeBucket,
  ResolvedPreference,
  ScratchBlob,
  TargetSpec,
} from "./types";

const MAX_ACTIONS = 80;
const SEARCH_ITERATIONS = 1_000;
const FALLBACK_SAMPLES = 3;
const BUDGET_BUCKET = 0.01;

interface ActionStat { visits: number; reward: number; name: string; }
interface SearchNode { visits: number; stateScore: number; actions: Record<string, ActionStat>; }

export function scoreItem(state: ItemState, preferences: ResolvedPreference[]): number {
  return preferences.reduce((score, preference) => {
    const rolled = allMods(state).find(mod => mod.group === preference.group);
    if (!rolled) return score;
    const tiers = preference.eligibleTiers;
    const index = tiers.indexOf(rolled.tier);
    if (index < 0) return score;
    const quality = (tiers.length - index) / tiers.length;
    return score + preference.weight * quality;
  }, 0);
}

export function budgetStateKey(state: ItemState, remainingBudget: number): string {
  const modKey = (mod: ModEntry) =>
    `${mod.gen_type}:${mod.group}:${mod.tier}:${state.fractured_mod_ids.has(mod.modId) ? "f" : ""}:${mod.hidden ? "h" : ""}`;
  const mods = allMods(state).map(modKey).sort().join(",");
  const catalyst = state.catalyst ? `${state.catalyst.type}:${state.catalyst.amount}:${state.catalyst.maximum}` : "";
  return `${state.rarity}|${mods}|${state.corrupted ? "c" : ""}|${catalyst}|b:${bucketBudget(remainingBudget)}`;
}

export function searchBudgetPolicy(scratch: ScratchBlob, seed = 0x41c6ce57): LearnedPolicy {
  const started = Date.now();
  const nodes = new Map<string, SearchNode>();
  const rng = seededRng(seed);

  for (let iteration = 0; iteration < SEARCH_ITERATIONS; iteration++) {
    let state = cloneState(scratch.startingItem);
    let remaining = scratch.budgetExalts;
    const path: { node: SearchNode; actionId: string }[] = [];

    for (let step = 0; step < MAX_ACTIONS; step++) {
      const candidates = affordableOutcomes(state, remaining, scratch, rng);
      if (candidates.length === 0) break;

      const key = budgetStateKey(state, remaining);
      const node = nodes.get(key) ?? { visits: 0, stateScore: scoreItem(state, scratch.preferences), actions: {} };
      nodes.set(key, node);
      const selected = selectUcb(candidates, node);
      if (!selected) break;

      node.actions[selected.action.id] ??= { visits: 0, reward: 0, name: selected.action.name };
      path.push({ node, actionId: selected.action.id });
      state = selected.state;
      remaining -= selected.cost;
    }

    const reward = scoreItem(state, scratch.preferences) + (remaining / Math.max(scratch.budgetExalts, 0.01)) * 0.01;
    for (const entry of path) {
      entry.node.visits++;
      const stat = entry.node.actions[entry.actionId];
      stat.visits++;
      stat.reward += reward;
    }
  }

  const decisions: LearnedPolicy["decisions"] = {};
  for (const [stateKey, node] of nodes) {
    const best = Object.entries(node.actions)
      .filter(([, stat]) => stat.visits > 0)
      .sort(([, a], [, b]) => b.reward / b.visits - a.reward / a.visits || b.visits - a.visits)[0];
    if (!best) continue;
    if (best[1].reward / best[1].visits <= node.stateScore) continue;
    decisions[stateKey] = {
      stateKey,
      actionId: best[0],
      actionName: best[1].name,
      visits: best[1].visits,
      expectedScore: best[1].reward / best[1].visits,
    };
  }
  return { decisions, searchIterations: SEARCH_ITERATIONS, searchDurationMs: Date.now() - started };
}

export function evaluateBudgetPolicy(scratch: ScratchBlob, policy: LearnedPolicy, shard: number, iterations: number, seed: number): EvaluationResult {
  const rng = seededRng(seed);
  const buckets = new Map<string, OutcomeBucket>();
  const actionCounts: Record<string, number> = {};
  let scoreSum = 0;
  let spendSum = 0;
  let maxSpend = 0;
  let overspendCount = 0;
  let fallbackCount = 0;

  for (let run = 0; run < iterations; run++) {
    let state = cloneState(scratch.startingItem);
    let remaining = scratch.budgetExalts;
    for (let step = 0; step < MAX_ACTIONS; step++) {
      const key = budgetStateKey(state, remaining);
      const decision = policy.decisions[key];
      const actions = legalActions(state, scratch);
      let action = decision ? actions.find(candidate => candidate.id === decision.actionId) : undefined;
      if (!action) {
        fallbackCount++;
        action = fallbackAction(state, remaining, scratch);
      }
      if (!action) break;
      const result = action.apply(CraftedItem.fromState(state), craftContext(scratch, rng));
      if (!result.applied) break;
      const cost = basketCost(result.cost, scratch.prices);
      if (cost > remaining + 1e-9) break;
      state = result.item.toState();
      remaining -= cost;
      actionCounts[action.name] = (actionCounts[action.name] ?? 0) + 1;
    }

    const score = scoreItem(state, scratch.preferences);
    const spend = scratch.budgetExalts - remaining;
    maxSpend = Math.max(maxSpend, spend);
    if (spend > scratch.budgetExalts + 1e-9) overspendCount++;
    scoreSum += score;
    spendSum += spend;
    addOutcome(buckets, state, scratch.preferences, score, spend);
  }

  return {
    shard,
    iterations,
    scoreSum,
    spendSum,
    maxSpend,
    overspendCount,
    fallbackCount,
    buckets: [...buckets.values()],
    actionCounts,
  };
}

function fallbackAction(state: ItemState, remaining: number, scratch: ScratchBlob): RefinementAction | undefined {
  const current = scoreItem(state, scratch.preferences);
  return legalActions(state, scratch)
    .map(action => ({ action, score: expectedActionScore(action, state, remaining, scratch) }))
    .filter(candidate => candidate.score > current)
    .sort((a, b) => b.score - a.score || a.action.id.localeCompare(b.action.id))[0]?.action;
}

function expectedActionScore(action: RefinementAction, state: ItemState, remaining: number, scratch: ScratchBlob): number {
  const rng = seededRng(hash(`${budgetStateKey(state, remaining)}|${action.id}`));
  let score = 0;
  let samples = 0;
  for (let i = 0; i < FALLBACK_SAMPLES; i++) {
    const result = action.apply(CraftedItem.fromState(state), craftContext(scratch, rng));
    if (!result.applied || basketCost(result.cost, scratch.prices) > remaining + 1e-9) continue;
    score += scoreItem(result.item.toState(), scratch.preferences);
    samples++;
  }
  return samples === FALLBACK_SAMPLES ? score / samples : Number.NEGATIVE_INFINITY;
}

function affordableOutcomes(state: ItemState, remaining: number, scratch: ScratchBlob, rng: () => number) {
  return legalActions(state, scratch).flatMap(action => {
    const result = action.apply(CraftedItem.fromState(state), craftContext(scratch, rng));
    if (!result.applied) return [];
    const cost = basketCost(result.cost, scratch.prices);
    if (cost > remaining + 1e-9) return [];
    return [{ action, state: result.item.toState(), cost, expectedScore: scoreItem(result.item.toState(), scratch.preferences) }];
  });
}

function selectUcb(candidates: ReturnType<typeof affordableOutcomes>, node: SearchNode) {
  return candidates.sort((a, b) => {
    const aStat = node.actions[a.action.id];
    const bStat = node.actions[b.action.id];
    const aUcb = aStat?.visits ? aStat.reward / aStat.visits + Math.sqrt(2 * Math.log(node.visits + 2) / aStat.visits) : Number.POSITIVE_INFINITY;
    const bUcb = bStat?.visits ? bStat.reward / bStat.visits + Math.sqrt(2 * Math.log(node.visits + 2) / bStat.visits) : Number.POSITIVE_INFINITY;
    return bUcb - aUcb || b.expectedScore - a.expectedScore || a.action.id.localeCompare(b.action.id);
  })[0];
}

function legalActions(state: ItemState, scratch: ScratchBlob): RefinementAction[] {
  const target = targetFromPreferences(scratch.preferences);
  const strategyContext = { pool: scratch.pool, target, prices: scratch.prices, baseId: scratch.baseId, ilvl: scratch.ilvl };
  const contextual = generateRefinementActions(state, strategyContext).filter(action => !action.id.startsWith("opening_"));
  const direct: RefinementAction[] = [];
  const ingredient = (id: string, name: string, value: { apply: RefinementAction["apply"] }) =>
    direct.push({ id, name, apply: value.apply.bind(value) });

  if (state.rarity === "normal" && !state.corrupted) {
    ingredient("transmute", "Orb of Transmutation", new TransmutationOrb());
    ingredient("greater_transmute", "Greater Orb of Transmutation", new GreaterTransmutationOrb());
    ingredient("perfect_transmute", "Perfect Orb of Transmutation", new PerfectTransmutationOrb());
    ingredient("alch", "Orb of Alchemy", new AlchemyOrb());
  } else if (state.rarity === "magic" && !state.corrupted) {
    if (allMods(state).length === 1) {
      ingredient("augment", "Orb of Augmentation", new AugmentationOrb());
      ingredient("greater_augment", "Greater Orb of Augmentation", new GreaterAugmentationOrb());
      ingredient("perfect_augment", "Perfect Orb of Augmentation", new PerfectAugmentationOrb());
    }
    ingredient("regal", "Regal Orb", new RegalOrb());
    ingredient("greater_regal", "Greater Regal Orb", new GreaterRegalOrb());
    ingredient("perfect_regal", "Perfect Regal Orb", new PerfectRegalOrb());
    const desiredGroups = new Set(scratch.preferences.map(preference => preference.group));
    for (const definition of EssenceCatalog.definitions()) {
      if (definition.tier !== "greater") continue;
      if (!(definition.byBaseId[scratch.baseId] ?? []).some(mod => desiredGroups.has(mod.group))) continue;
      const essence = EssenceCatalog.create(definition.id, scratch.baseId);
      if (essence) ingredient(`essence_${definition.id}`, definition.name, essence);
    }
  }
  return [...direct, ...contextual];
}

function targetFromPreferences(preferences: ResolvedPreference[]): TargetSpec {
  return {
    required_mods: preferences.map(preference => ({
      group: preference.group,
      min_tier: Math.max(...preference.eligibleTiers),
      gen_type: preference.affix,
      name: preference.name,
    })),
    k_required: Math.min(6, preferences.length),
  };
}

function craftContext(scratch: ScratchBlob, rng: () => number): CraftContext {
  return { pool: scratch.pool, rng, itemLevel: scratch.ilvl, target: targetFromPreferences(scratch.preferences) };
}

function addOutcome(
  buckets: Map<string, OutcomeBucket>,
  state: ItemState,
  preferences: ResolvedPreference[],
  score: number,
  spend: number,
): void {
  const desiredGroups = new Set(preferences.map(preference => preference.group));
  const mods = allMods(state)
    .filter(mod => desiredGroups.has(mod.group))
    .map(mod => ({ group: mod.group, modId: mod.modId, name: mod.name, affix: mod.gen_type, tier: mod.tier }))
    .sort((a, b) => a.group.localeCompare(b.group));
  const signature = mods.map(mod => `${mod.group}:T${mod.tier}`).join("|") || "none";
  const bucket = buckets.get(signature) ?? { signature, count: 0, scoreSum: 0, spendSum: 0, mods };
  bucket.count++;
  bucket.scoreSum += score;
  bucket.spendSum += spend;
  buckets.set(signature, bucket);
}

function allMods(state: ItemState): ModEntry[] {
  return [...state.prefixes, ...state.suffixes];
}

function basketCost(basket: Record<string, number>, prices: Record<string, number>): number {
  return Object.entries(basket).reduce((sum, [key, count]) => {
    const price = prices[key];
    return Number.isFinite(price) && price >= 0 ? sum + price * count : Number.POSITIVE_INFINITY;
  }, 0);
}

function cloneState(state: ItemState): ItemState {
  return {
    ...state,
    prefixes: [...state.prefixes],
    suffixes: [...state.suffixes],
    fractured_mod_ids: new Set(state.fractured_mod_ids),
    catalyst: state.catalyst ? { ...state.catalyst } : undefined,
  };
}

function bucketBudget(value: number): number {
  return Math.max(0, Math.round(value / BUDGET_BUCKET) * BUDGET_BUCKET);
}

function hash(value: string): number {
  let out = 2166136261;
  for (let i = 0; i < value.length; i++) {
    out ^= value.charCodeAt(i);
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
