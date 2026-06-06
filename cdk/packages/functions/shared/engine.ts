/**
 * PoE2 Craft Engine — pure simulation core (spec §1–§5).
 * Ported from web/src/lib/craft-engine.ts; logic unchanged except `summarize`
 * now also emits a cost-vs-success CDF curve.
 */
import type {
  ModEntry, ModPool, TargetSpec, TargetMod, ItemState, OmenType,
  PriceTable, CostSummary, CdfPoint, RawMod, SolveRequest,
} from "./types";
import { CraftedItem, draw as drawFromDomain } from "./domain/CraftedItem";
import { EssenceCatalog } from "./domain/EssenceCatalog";
import {
  AlchemyOrb,
  AnnulmentOrb,
  AugmentationOrb,
  ChaosOrb,
  ExaltedOrb,
  FracturingOrb,
  RegalOrb,
  TransmutationOrb,
} from "./ingredients";
import {
  OmenOfDextralAnnulment,
  OmenOfDextralAlchemy,
  OmenOfDextralCrystallisation,
  OmenOfDextralCoronation,
  OmenOfDextralErasure,
  OmenOfDextralExaltation,
  OmenOfGreaterExaltation,
  OmenOfGreaterAnnulment,
  OmenOfSinistralAnnulment,
  OmenOfSinistralAlchemy,
  OmenOfSinistralCrystallisation,
  OmenOfSinistralCoronation,
  OmenOfSinistralErasure,
  OmenOfSinistralExaltation,
  OmenOfWhittling,
  withModifiers,
  type CraftingModifier,
} from "./modifiers";
import type { CraftingIngredient } from "./ingredients";

// ─────────────────────────────────────────────────────────────────────────────
// § 1. Item-state helpers
// ─────────────────────────────────────────────────────────────────────────────

export function n_mods(s: ItemState): number { return s.prefixes.length + s.suffixes.length; }
export function open_prefix(s: ItemState): boolean { return s.prefixes.length < (s.rarity === "magic" ? 1 : 3); }
export function open_suffix(s: ItemState): boolean { return s.suffixes.length < (s.rarity === "magic" ? 1 : 3); }
export function present_groups(s: ItemState): Set<string> {
  return new Set([...s.prefixes, ...s.suffixes].map(m => m.group));
}
export function all_mods(s: ItemState): ModEntry[] { return [...s.prefixes, ...s.suffixes]; }
export function non_fractured(s: ItemState): ModEntry[] {
  return all_mods(s).filter(m => !s.fractured_mod_ids.has(m.modId));
}
export function empty_normal(): ItemState {
  return { rarity: "normal", prefixes: [], suffixes: [], fractured_mod_ids: new Set(), corrupted: false };
}
export function clone(s: ItemState): ItemState {
  return { ...s, prefixes: [...s.prefixes], suffixes: [...s.suffixes], fractured_mod_ids: new Set(s.fractured_mod_ids) };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. Pool building & weighted draw
// ─────────────────────────────────────────────────────────────────────────────

export function build_pools(mods: RawMod[], ilvl: number): ModPool {
  const eligible = mods.flatMap(m => m.tiers
    .filter(t => t.ilvl <= ilvl && t.weight > 0)
    .map(t => ({
      modId:          m.modId,
      group:          m.modgroups?.[0] ?? m.modId,
      gen_type:       m.affix as "prefix" | "suffix",
      tier:           t.tier,
      required_level: t.ilvl,
      weight:         t.weight,
      name:           m.name,
    } as ModEntry)));
  return {
    prefixes: eligible.filter(m => m.gen_type === "prefix"),
    suffixes: eligible.filter(m => m.gen_type === "suffix"),
  };
}

// Weighted draw from pool, excluding present groups (exclusivity blocking).
export function draw(pool: ModEntry[], present: Set<string>, rng: () => number): ModEntry | null {
  return drawFromDomain(pool, present, rng);
}

// Analytic: P(drawing a mod from group g at tier <= min_tier given present groups)
export function p_hit(pool: ModEntry[], g: string, min_tier: number, present: Set<string>): number {
  const cand = pool.filter(m => !present.has(m.group));
  const W = cand.reduce((s, m) => s + m.weight, 0);
  if (W === 0) return 0;
  const good = cand.filter(m => m.group === g && m.tier <= min_tier).reduce((s, m) => s + m.weight, 0);
  return good / W;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. Currency action primitives
// Compatibility wrappers around the OO ingredient model.
// ─────────────────────────────────────────────────────────────────────────────

export function act_transmute(s: ItemState, pool: ModPool, rng: () => number): ItemState {
  return new TransmutationOrb().apply(CraftedItem.fromState(s), { pool, rng }).item.toState();
}

export function act_augment(s: ItemState, pool: ModPool, rng: () => number): ItemState {
  return new AugmentationOrb().apply(CraftedItem.fromState(s), { pool, rng }).item.toState();
}

export function act_regal(s: ItemState, pool: ModPool, rng: () => number, omen: OmenType = null): ItemState {
  return applyWithOptionalOmen(new RegalOrb(), omen, s, pool, rng);
}

export function act_alchemy(s: ItemState, pool: ModPool, rng: () => number, omen: OmenType = null): ItemState {
  return applyWithOptionalOmen(new AlchemyOrb(), omen, s, pool, rng);
}

export function act_exalt(s: ItemState, pool: ModPool, rng: () => number, omen: OmenType = null): ItemState {
  return applyWithOptionalOmen(new ExaltedOrb(), omen, s, pool, rng);
}

export function act_chaos(s: ItemState, pool: ModPool, rng: () => number, omen: OmenType = null): ItemState {
  return applyWithOptionalOmen(new ChaosOrb(), omen, s, pool, rng);
}

export function act_annul(s: ItemState, rng: () => number, omen: OmenType = null): ItemState {
  return applyWithOptionalOmen(new AnnulmentOrb(), omen, s, { prefixes: [], suffixes: [] }, rng);
}

export function act_fracture(s: ItemState, rng: () => number): ItemState {
  return new FracturingOrb().apply(CraftedItem.fromState(s), { pool: { prefixes: [], suffixes: [] }, rng }).item.toState();
}

export function act_essence(
  s: ItemState, pool: ModPool, rng: () => number,
  essenceId: string,
  baseId: string,
  omen: OmenType = null,
): ItemState {
  const essence = EssenceCatalog.create(essenceId, baseId);
  if (!essence) return s;
  return applyWithOptionalOmen(essence, omen, s, pool, rng);
}

function applyWithOptionalOmen(
  ingredient: CraftingIngredient,
  omen: OmenType,
  state: ItemState,
  pool: ModPool,
  rng: () => number,
): ItemState {
  const modifier = modifierFromOmen(omen, ingredient.id);
  const applied = modifier ? withModifiers(ingredient, modifier) : ingredient;
  return applied.apply(CraftedItem.fromState(state), { pool, rng }).item.toState();
}

function modifierFromOmen(omen: OmenType, ingredientId: string): CraftingModifier | null {
  switch (omen) {
    case "whittling": return new OmenOfWhittling();
    case "sinistral_erasure": return new OmenOfSinistralErasure();
    case "dextral_erasure": return new OmenOfDextralErasure();
    case "sinistral":
      return ingredientId === "annul"
        ? new OmenOfSinistralAnnulment()
        : ingredientId === "alch"
          ? new OmenOfSinistralAlchemy()
          : ingredientId.includes("regal")
            ? new OmenOfSinistralCoronation()
            : new OmenOfSinistralExaltation();
    case "dextral":
      return ingredientId === "annul"
        ? new OmenOfDextralAnnulment()
        : ingredientId === "alch"
          ? new OmenOfDextralAlchemy()
          : ingredientId.includes("regal")
            ? new OmenOfDextralCoronation()
            : new OmenOfDextralExaltation();
    case "greater": return ingredientId === "annul" ? new OmenOfGreaterAnnulment() : new OmenOfGreaterExaltation();
    case "greater_annulment": return new OmenOfGreaterAnnulment();
    case "sinistral_annulment": return new OmenOfSinistralAnnulment();
    case "dextral_annulment": return new OmenOfDextralAnnulment();
    case "sinistral_crystallisation": return new OmenOfSinistralCrystallisation();
    case "dextral_crystallisation": return new OmenOfDextralCrystallisation();
    case "homogenising":
    case null:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4. Target matcher
// ─────────────────────────────────────────────────────────────────────────────

export function is_satisfied(s: ItemState, target: TargetSpec): boolean {
  let hits = 0;
  for (const t of target.required_mods) {
    if (all_mods(s).find(m => m.group === t.group && m.tier <= t.min_tier)) hits++;
  }
  return hits >= target.k_required;
}

export function count_hits(s: ItemState, target: TargetSpec): number {
  return target.required_mods.filter(t =>
    all_mods(s).some(m => m.group === t.group && m.tier <= t.min_tier)
  ).length;
}

export function mod_satisfied(s: ItemState, t: TargetMod): boolean {
  return all_mods(s).some(m => m.group === t.group && m.tier <= t.min_tier);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5. Costing — Monte Carlo + summary (extended with CDF curve)
// ─────────────────────────────────────────────────────────────────────────────

export type Policy = (rng: () => number, pool: ModPool, target: TargetSpec, prices: PriceTable) => Record<string, number>;

function build_cdf(sorted: number[], points = 60): CdfPoint[] {
  const n = sorted.length;
  if (n === 0) return [];
  const cdf: CdfPoint[] = [];
  for (let i = 1; i <= points; i++) {
    const q = i / points;                       // quantile in (0, 1]
    const idx = Math.min(n - 1, Math.floor(q * n));
    cdf.push({ cost: Math.round(sorted[idx] * 100) / 100, cumProb: Math.round(q * 1000) / 1000 });
  }
  return cdf;
}

export function summarize(costs: number[]): CostSummary {
  const n = costs.length;
  const sorted = [...costs].sort((a, b) => a - b);
  const mean = costs.reduce((s, c) => s + c, 0) / n;
  const variance = costs.reduce((s, c) => s + (c - mean) ** 2, 0) / n;
  return {
    mean,
    p50:  sorted[Math.floor(n * 0.50)],
    p90:  sorted[Math.floor(n * 0.90)],
    p99:  sorted[Math.floor(n * 0.99)],
    std:  Math.sqrt(variance),
    n,
    costCdf: build_cdf(sorted),
  };
}

export function price_basket(basket: Record<string, number>, prices: PriceTable): number {
  return Object.entries(basket).reduce((sum, [k, v]) => sum + v * (prices[k] ?? 0), 0);
}

export function monte_carlo(
  policy: Policy, pool: ModPool, target: TargetSpec, prices: PriceTable,
  N = 50_000, seed = 0x12345678,
): CostSummary {
  let s = seed;
  function rng(): number {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0x100000000;
  }
  const costs: number[] = [];
  for (let i = 0; i < N; i++) {
    const basket = policy(rng, pool, target, prices);
    costs.push(price_basket(basket, prices));
  }
  return summarize(costs);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6. Target spec + feasibility (spec §4 forced/impossible checks)
// ─────────────────────────────────────────────────────────────────────────────

export function build_target_spec(req: SolveRequest, pool: ModPool): TargetSpec {
  const required_mods: TargetMod[] = req.targetMods.map(m => {
    const poolMod = [...pool.prefixes, ...pool.suffixes].find(p => p.modId === m.modId);
    const group = m.group ?? poolMod?.group ?? m.modId;
    return {
      group,
      min_tier: req.mode === "exact" ? m.tier : (Number(m.minTier) || m.tier),
      gen_type: m.affix as "prefix" | "suffix",
      name:     m.name,
    };
  });
  return { required_mods, k_required: Math.min(req.k_required, required_mods.length) };
}

export function check_feasibility(target: TargetSpec, pool: ModPool, ilvl: number): string | null {
  for (const t of target.required_mods) {
    const p = t.gen_type === "prefix" ? pool.prefixes : pool.suffixes;
    const available = p.filter(m => m.group === t.group && m.tier <= t.min_tier);
    if (available.length === 0) {
      return `Mod "${t.name}" (group: ${t.group}) at tier ≤ ${t.min_tier} cannot roll on this base at ilvl ${ilvl}`;
    }
  }
  return null;
}
