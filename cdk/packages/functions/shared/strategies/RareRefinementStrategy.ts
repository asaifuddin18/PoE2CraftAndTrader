import { AlchemyOrb } from "../ingredients";
import { addCurrency, mergeCurrency, type CurrencyBasket } from "../domain/CurrencyBasket";
import { CraftedItem } from "../domain/CraftedItem";
import { empty_normal, is_satisfied, type Policy } from "../engine";
import type { CraftStep, ItemState, ModPool, PatternJob, PriceTable, SolveRequest, TargetSpec } from "../types";
import type { SolverStrategy, StrategyBuildContext } from "./SolverStrategy";
import { canonicalStateKey } from "./StateCanonicalizer";
import { optimisticRemainingCost } from "./WeightHeuristic";
import { basketPrice, REFINEMENT_ACTIONS, type RefinementAction } from "./RareRefinementActions";

const MAX_ACTIONS = 120;
const SEARCH_SAMPLES = 4;
const MAX_CACHED_STATES = 1_500;
const RESTART_ID = "restart_alchemy";

interface SelectedAction {
  id: string;
  name: string;
  action?: RefinementAction;
}

export class RareRefinementStrategy implements SolverStrategy {
  readonly id = "rare_refinement" as const;
  readonly name = "Adaptive Rare Refinement";
  readonly description = "A bounded stochastic best-first policy that chooses the lowest expected-cost legal craft for the current item state.";

  isApplicable(_req: SolveRequest, _target: TargetSpec, pool: ModPool): boolean {
    return pool.prefixes.length > 0 && pool.suffixes.length > 0;
  }

  createJob(_req: SolveRequest, _target: TargetSpec, _pool: ModPool): PatternJob {
    return {
      patternId: this.id,
      patternName: this.name,
      description: this.description,
      strategyId: this.id,
      N: 300,
      seed: 0x5a17c0de,
    };
  }

  buildPolicy({ pool, target, prices }: StrategyBuildContext): Policy {
    const actionCache = new Map<string, SelectedAction>();

    return rng => {
      let basket: CurrencyBasket = {};
      let state = empty_normal();

      for (let actions = 0; actions < MAX_ACTIONS && !is_satisfied(state, target); actions++) {
        if (state.rarity !== "rare") {
          const restarted = restartWithAlchemy(pool, rng);
          if (!restarted) break;
          state = restarted.state;
          basket = mergeCurrency(basket, restarted.cost);
          continue;
        }

        const key = canonicalStateKey(state, target);
        let selected = actionCache.get(key);
        if (!selected) {
          selected = selectAction(state, pool, target, prices);
          if (actionCache.size < MAX_CACHED_STATES) actionCache.set(key, selected);
        }

        if (selected.id === RESTART_ID) {
          const restarted = restartWithAlchemy(pool, rng);
          if (!restarted) break;
          state = restarted.state;
          basket = mergeCurrency(basket, restarted.cost);
          continue;
        }

        const result = selected.action!.apply(CraftedItem.fromState(state), { pool, rng });
        if (!result.applied) {
          const restarted = restartWithAlchemy(pool, rng);
          if (!restarted) break;
          state = restarted.state;
          basket = mergeCurrency(basket, restarted.cost);
          continue;
        }
        state = result.item.toState();
        basket = mergeCurrency(basket, result.cost);
      }

      return is_satisfied(state, target) ? basket : addCurrency(basket, "solver_failure");
    };
  }

  describe(_context: StrategyBuildContext, meanCost: number): CraftStep[] {
    return [
      {
        action: "Acquire a normal base and use Orb of Alchemy",
        currency: "white_base + alch",
        probability: 1,
        expectedCost: 0,
        branchCondition: "Creates a fresh four-affix rare whenever the policy chooses to restart.",
      },
      {
        action: "Evaluate every legal refinement action for the current item",
        currency: "adaptive",
        probability: 1,
        expectedCost: 0,
        branchCondition: "Uses modifier weights, currency prices, and sampled outcomes to choose Exalt, Chaos, Annulment, or restart.",
      },
      {
        action: "Repeat the selected policy action until the requested target is reached",
        currency: "adaptive",
        probability: 1,
        expectedCost: meanCost,
        branchCondition: "The action is re-evaluated after every stochastic crafting outcome.",
      },
    ];
  }
}

function selectAction(state: ItemState, pool: ModPool, target: TargetSpec, prices: PriceTable): SelectedAction {
  const candidates: { selected: SelectedAction; score: number }[] = [];
  const restart = estimateRestart(pool, target, prices);
  if (Number.isFinite(restart)) {
    candidates.push({ selected: { id: RESTART_ID, name: "Restart with Orb of Alchemy" }, score: restart });
  }

  for (const action of REFINEMENT_ACTIONS) {
    const score = estimateAction(action, state, pool, target, prices);
    if (Number.isFinite(score)) candidates.push({ selected: { id: action.id, name: action.name, action }, score });
  }

  return candidates.sort((a, b) => a.score - b.score || a.selected.id.localeCompare(b.selected.id))[0]?.selected
    ?? { id: RESTART_ID, name: "Restart with Orb of Alchemy" };
}

function estimateAction(action: RefinementAction, state: ItemState, pool: ModPool, target: TargetSpec, prices: PriceTable): number {
  const rng = seededRng(hash(`${canonicalStateKey(state, target)}|${action.id}`));
  let total = 0;
  let applied = 0;
  for (let i = 0; i < SEARCH_SAMPLES; i++) {
    const result = action.apply(CraftedItem.fromState(state), { pool, rng });
    if (!result.applied) continue;
    total += basketPrice(result.cost, prices) + optimisticRemainingCost(result.item.toState(), target, pool, prices);
    applied++;
  }
  return applied === SEARCH_SAMPLES ? total / applied : Number.POSITIVE_INFINITY;
}

function estimateRestart(pool: ModPool, target: TargetSpec, prices: PriceTable): number {
  const rng = seededRng(hash(`restart|${target.required_mods.map(mod => `${mod.group}:${mod.min_tier}`).sort().join("|")}`));
  let total = 0;
  for (let i = 0; i < SEARCH_SAMPLES; i++) {
    const restarted = restartWithAlchemy(pool, rng);
    if (!restarted) return Number.POSITIVE_INFINITY;
    total += basketPrice(restarted.cost, prices) + optimisticRemainingCost(restarted.state, target, pool, prices);
  }
  return total / SEARCH_SAMPLES;
}

function restartWithAlchemy(pool: ModPool, rng: () => number): { state: ItemState; cost: CurrencyBasket } | null {
  const result = new AlchemyOrb().apply(CraftedItem.emptyNormal(), { pool, rng });
  if (!result.applied) return null;
  return {
    state: result.item.toState(),
    cost: addCurrency(result.cost, "white_base"),
  };
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
