/**
 * Pattern catalog (spec §4) + candidate enumeration for the Step Functions Map.
 *
 * `enumerate_candidates` produces small PatternJob descriptors (one per worker);
 * `build_policy` reconstructs the runnable Policy from a job; `describe_steps`
 * builds the structured, per-step-probability trace for the output.
 */
import type {
  ModPool, TargetSpec, TargetMod, ModEntry, PriceTable, PatternJob, CraftStep, SolveRequest,
} from "./types";
import {
  Policy, empty_rare, is_satisfied, mod_satisfied, open_prefix, open_suffix, p_hit,
} from "./engine";
import { CraftedItem } from "./domain/CraftedItem";
import type { CurrencyBasket } from "./domain/CurrencyBasket";
import { addCurrency, mergeCurrency } from "./domain/CurrencyBasket";
import type { CraftingIngredient } from "./ingredients";
import {
  AlchemyOrb,
  AugmentationOrb,
  ChaosOrb,
  Essence,
  ExaltedOrb,
  FracturingOrb,
  RegalOrb,
  TransmutationOrb,
} from "./ingredients";

// ── Policy factories (ported from craft-engine.ts) ────────────────────────────

// Absolute per-sample action budget — guarantees every Monte-Carlo sample
// terminates promptly even when the target is effectively unreachable for a
// pattern. Counts EVERY currency action (incl. nested loops), so worst-case
// work per sample is bounded regardless of loop nesting.
const MAX_ITERS = 500;

function addCost(basket: CurrencyBasket, cost: CurrencyBasket): CurrencyBasket {
  return mergeCurrency(basket, cost);
}

function spend(basket: CurrencyBasket, currency: string, amount = 1): CurrencyBasket {
  return addCurrency(basket, currency, amount);
}

function applyIngredient(
  state: ModEntryState,
  ingredient: CraftingIngredient,
  pool: ModPool,
  rng: () => number,
  basket: CurrencyBasket,
): { state: ModEntryState; basket: CurrencyBasket } {
  const result = ingredient.apply(CraftedItem.fromState(state), { pool, rng });
  return { state: result.item.toState(), basket: addCost(basket, result.cost) };
}

type ModEntryState = ReturnType<typeof empty_rare>;

function policy_B3(whittling: boolean, restart_threshold: number): Policy {
  return (rng, pool, target) => {
    let basket: CurrencyBasket = { white_base: 1 };
    let state = empty_rare();
    ({ state, basket } = applyIngredient(state, new AlchemyOrb(), pool, rng, basket));

    let attempts = 0, guard = 0;
    while (!is_satisfied(state, target)) {
      if (++guard > MAX_ITERS) break;
      if (attempts >= restart_threshold) {
        basket = spend(basket, "white_base");
        state = empty_rare();
        ({ state, basket } = applyIngredient(state, new AlchemyOrb(), pool, rng, basket));
        attempts = 0; continue;
      }
      ({ state, basket } = applyIngredient(state, new ChaosOrb(whittling ? "whittling" : null), pool, rng, basket));
      attempts++;
    }
    return basket;
  };
}

function policy_A1(anchors: TargetMod[], restart_threshold: number): Policy {
  return (rng, pool, target) => {
    let basket: CurrencyBasket = { white_base: 1 };
    let attempts = 0, guard = 0;
    while (true) {
      if (++guard > MAX_ITERS) return basket;
      if (attempts >= restart_threshold) { basket = spend(basket, "white_base"); attempts = 0; }

      let state = empty_rare();
      ({ state, basket } = applyIngredient(state, new TransmutationOrb(), pool, rng, basket));
      state.rarity = "magic";

      let inner = 0;
      while (!anchors.every(t => mod_satisfied(state, t)) && inner < 50) {
        if (++guard > MAX_ITERS) return basket;
        if (state.prefixes.length + state.suffixes.length < 2) {
          ({ state, basket } = applyIngredient(state, new AugmentationOrb(), pool, rng, basket));
        } else {
          state = empty_rare();
          const result = new TransmutationOrb().apply(CraftedItem.fromState(state), { pool, rng });
          state = result.item.toState();
          state.rarity = "magic";
          // Alteration is a modeling artifact for "reroll this magic item";
          // it is intentionally not charged as a Transmutation Orb.
          basket = spend(basket, "alteration");
        }
        inner++;
      }
      if (!anchors.every(t => mod_satisfied(state, t))) { attempts++; continue; }

      ({ state, basket } = applyIngredient(state, new RegalOrb(), pool, rng, basket));
      while (open_prefix(state) || open_suffix(state)) {
        ({ state, basket } = applyIngredient(state, new ExaltedOrb(), pool, rng, basket));
      }
      if (is_satisfied(state, target)) return basket;
      attempts++;
    }
  };
}

function policy_C2(essence_mod: ModEntry, essence_currency: string, restart_threshold: number): Policy {
  return (rng, pool, target) => {
    let basket: CurrencyBasket = { white_base: 1 };
    let attempts = 0, guard = 0;
    while (true) {
      if (++guard > MAX_ITERS) return basket;
      if (attempts >= restart_threshold) { basket = spend(basket, "white_base"); attempts = 0; }
      let state = empty_rare();
      ({ state, basket } = applyIngredient(state, new Essence(essence_currency, essence_mod, "greater"), pool, rng, basket));

      let inner = 0;
      while (!is_satisfied(state, target) && inner < restart_threshold) {
        if (++guard > MAX_ITERS) return basket;
        ({ state, basket } = applyIngredient(state, new ChaosOrb("whittling"), pool, rng, basket));
        inner++;
      }
      if (is_satisfied(state, target)) return basket;
      attempts++;
    }
  };
}

function policy_E1(anchor_group: string, inner_restart: number): Policy {
  return (rng, pool, target) => {
    let basket: CurrencyBasket = { white_base: 1 };
    let guard = 0;

    while (true) {
      if (++guard > MAX_ITERS) return basket;

      let state = empty_rare();
      ({ state, basket } = applyIngredient(state, new AlchemyOrb(), pool, rng, basket));

      let phase1 = 0;
      while (![...state.prefixes, ...state.suffixes].some(m => m.group === anchor_group) && phase1 < 200) {
        if (++guard > MAX_ITERS) return basket;
        ({ state, basket } = applyIngredient(state, new ChaosOrb(), pool, rng, basket));
        phase1++;
      }
      const anchor = [...state.prefixes, ...state.suffixes].find(m => m.group === anchor_group);
      if (!anchor) {
        basket = spend(basket, "white_base");
        continue;
      }

      ({ state, basket } = applyIngredient(state, new FracturingOrb(), pool, rng, basket));
      if (!state.fractured_mod_ids.has(anchor.modId)) {
        basket = spend(basket, "white_base");
        continue;
      }

      const rest_target: TargetSpec = {
        required_mods: target.required_mods.filter(t => t.group !== anchor_group),
        k_required: Math.max(0, target.k_required - 1),
      };
      if (rest_target.required_mods.length === 0) return basket;

      let phase2 = 0;
      while (!is_satisfied(state, rest_target) && phase2 < inner_restart) {
        if (++guard > MAX_ITERS) return basket;
        ({ state, basket } = applyIngredient(state, new ChaosOrb("whittling"), pool, rng, basket));
        phase2++;
      }
      if (is_satisfied(state, target)) return basket;
      basket = spend(basket, "white_base");
    }
  };
}

// ── Rebuild a runnable Policy from a job descriptor ───────────────────────────

export function build_policy(job: PatternJob, target: TargetSpec): Policy {
  const p = job.params;
  switch (job.policyKind) {
    case "B3":
      return policy_B3(p.whittling ?? true, p.restart_threshold);
    case "A1": {
      const anchors = (p.anchor_groups ?? []).map(g => target.required_mods.find(t => t.group === g)!).filter(Boolean);
      return policy_A1(anchors, p.restart_threshold);
    }
    case "C2": {
      const e = p.essence!;
      const mod: ModEntry = { modId: e.modId, group: e.group, gen_type: e.gen_type, tier: e.tier, required_level: 0, weight: 1, name: e.currency };
      return policy_C2(mod, e.currency, p.restart_threshold);
    }
    case "E1":
      return policy_E1(p.anchor_group!, p.restart_threshold);
  }
}

// ── Candidate enumeration (the Map fan-out list) ──────────────────────────────

// Monte-Carlo sample count for ranking. Kept modest so each worker finishes
// well within the Lambda timeout on ~1 vCPU; the winning pattern is refined at
// a higher N in the aggregate step.
const N_RANK = 6_000;

export function enumerate_candidates(req: SolveRequest, target: TargetSpec, pool: ModPool): PatternJob[] {
  const jobs: PatternJob[] = [];

  // B3 — Alchemy → Chaos-loop (whittling). Always applicable.
  for (const t of [8, 15, 30]) {
    jobs.push({
      patternId: `B3_t${t}`, patternName: "Alchemy → Chaos-loop", policyKind: "B3",
      description: `Alchemy to rare (4 mods), then Chaos with Omen of Whittling to replace junk one at a time. Restart after ${t} chaos without success.`,
      N: N_RANK, seed: 0xB30000 + t, params: { restart_threshold: t, whittling: true },
    });
  }

  // A1 — Alt-Regal, for small anchor sets.
  if (target.required_mods.length <= 3) {
    const anchors = target.required_mods.slice(0, Math.min(2, target.required_mods.length));
    for (const t of [5, 12]) {
      jobs.push({
        patternId: `A1_t${t}`, patternName: "Alt-Regal (Transmute→Aug→Regal)", policyKind: "A1",
        description: `Transmute→Augment-loop to land anchor mod(s), then Regal to rare + Exalt-fill open slots.`,
        N: N_RANK, seed: 0xA10000 + t, params: { restart_threshold: t, anchor_groups: anchors.map(a => a.group) },
      });
    }
  }

  // C2 — Essence anchor → Chaos fill (only when an essence anchor is supplied).
  if (req.essenceMod) {
    const e = req.essenceMod;
    for (const t of [8, 20]) {
      jobs.push({
        patternId: `C2_t${t}`, patternName: "Essence → Chaos-fill", policyKind: "C2",
        description: `Essence guarantees the hardest mod, Chaos fills the rest. Restart after ${t} chaos attempts.`,
        N: N_RANK, seed: 0xC20000 + t, params: { restart_threshold: t, essence: e },
      });
    }
  }

  // E1 — Fracture the rarest anchor → Chaos the rest.
  if (target.required_mods.length >= 2) {
    const rarest = target.required_mods.reduce((min, t) => {
      const p  = p_hit(t.gen_type === "prefix" ? pool.prefixes : pool.suffixes, t.group, t.min_tier, new Set());
      const pm = p_hit(min.gen_type === "prefix" ? pool.prefixes : pool.suffixes, min.group, min.min_tier, new Set());
      return p < pm ? t : min;
    });
    for (const t of [20, 50]) {
      jobs.push({
        patternId: `E1_t${t}`, patternName: "Fracture + Chaos", policyKind: "E1",
        description: `Chaos until "${rarest.name}" appears, fracture it (permanent), then chaos the remaining mods. Restart after ${t} attempts.`,
        N: N_RANK, seed: 0xE10000 + t, params: { restart_threshold: t, anchor_group: rarest.group },
      });
    }
  }

  return jobs;
}

// ── Structured step trace (per-step probability + expected cost) ──────────────

export function describe_steps(
  job: PatternJob, target: TargetSpec, pool: ModPool, prices: PriceTable, meanCost: number,
): CraftStep[] {
  const empty = new Set<string>();
  const p = job.params;
  const baseStep: CraftStep = { action: `Acquire ilvl≥${(target as any).ilvl ?? ""} white base`.trim(), currency: "white_base", probability: 1, expectedCost: prices.white_base ?? 0 };

  switch (job.policyKind) {
    case "B3": {
      // success per chaos ≈ P(filling the last missing target group)
      const pStep = target.required_mods.reduce((acc, t) =>
        acc + p_hit(t.gen_type === "prefix" ? pool.prefixes : pool.suffixes, t.group, t.min_tier, empty), 0) / target.required_mods.length;
      return [
        { action: "Acquire white base", currency: "white_base", probability: 1, expectedCost: prices.white_base ?? 0 },
        { action: "Orb of Alchemy → rare with 4 random mods", currency: "alch", probability: 1, expectedCost: prices.alch ?? 0 },
        { action: `Chaos + Omen of Whittling (1 omen each) until ${target.k_required} target mod(s) present`, currency: "chaos + omen_whittling",
          probability: Math.min(1, pStep), expectedCost: meanCost, branchCondition: `repeat until satisfied; restart base after ${p.restart_threshold} chaos` },
      ];
    }
    case "A1": {
      const anchors = (p.anchor_groups ?? []).map(g => target.required_mods.find(t => t.group === g)!).filter(Boolean);
      const pAnchor = anchors.reduce((acc, t) =>
        acc * p_hit(t.gen_type === "prefix" ? pool.prefixes : pool.suffixes, t.group, t.min_tier, empty), 1);
      return [
        baseStep,
        { action: "Transmute → magic", currency: "transmute", probability: 1, expectedCost: prices.transmute ?? 0 },
        { action: `Alteration/Augment until anchor(s) present: ${anchors.map(a => a.name).join(", ")}`, currency: "augment",
          probability: Math.min(1, pAnchor), expectedCost: meanCost * 0.5, branchCondition: `restart magic after ${p.restart_threshold} tries` },
        { action: "Regal Orb → rare (adds 1 mod)", currency: "regal", probability: 1, expectedCost: prices.regal ?? 0 },
        { action: "Exalt to fill remaining open slots", currency: "exalt", probability: 1, expectedCost: prices.exalt ?? 0 },
      ];
    }
    case "C2": {
      const e = p.essence!;
      return [
        baseStep,
        { action: `${e.currency.replace(/_/g, " ")} → rare, guarantees anchor mod`, currency: e.currency, probability: 1, expectedCost: prices[e.currency] ?? 0 },
        { action: `Chaos w/ Omen of Whittling to fill remaining ${target.required_mods.length - 1} mod(s)`, currency: "chaos",
          probability: 1, expectedCost: meanCost, branchCondition: `restart base after ${p.restart_threshold} chaos` },
      ];
    }
    case "E1": {
      const anchorT = target.required_mods.find(t => t.group === p.anchor_group);
      const pAnchor = anchorT ? p_hit(anchorT.gen_type === "prefix" ? pool.prefixes : pool.suffixes, anchorT.group, anchorT.min_tier, empty) : 0;
      return [
        { action: "Alchemy → rare", currency: "alch", probability: 1, expectedCost: prices.alch ?? 0 },
        { action: `Chaos until "${anchorT?.name ?? p.anchor_group}" appears`, currency: "chaos", probability: Math.min(1, pAnchor), expectedCost: meanCost * 0.4 },
        { action: "Fracturing Orb → lock anchor permanently (1/N)", currency: "fracturing_orb", probability: 0.25, expectedCost: prices.fracturing_orb ?? 0 },
        { action: `Chaos remaining ${target.required_mods.length - 1} mod(s) independently`, currency: "chaos", probability: 1, expectedCost: meanCost * 0.6,
          branchCondition: `restart after ${p.restart_threshold} attempts` },
      ];
    }
  }
}
