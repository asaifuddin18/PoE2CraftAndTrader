/**
 * PoE2 Craft Engine — pure simulation core (spec §1–§5).
 * Ported from web/src/lib/craft-engine.ts; logic unchanged except `summarize`
 * now also emits a cost-vs-success CDF curve.
 */
import type {
  ModEntry, ModPool, TargetSpec, TargetMod, ItemState, OmenType,
  PriceTable, CostSummary, CdfPoint, RawMod, SolveRequest,
} from "./types";

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
export function empty_rare(): ItemState {
  return { rarity: "rare", prefixes: [], suffixes: [], fractured_mod_ids: new Set(), corrupted: false };
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
  const cand = pool.filter(m => !present.has(m.group));
  const W = cand.reduce((s, m) => s + m.weight, 0);
  if (W === 0) return null;
  let r = rng() * W;
  for (const m of cand) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return cand[cand.length - 1];
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
// ─────────────────────────────────────────────────────────────────────────────

function add_mod(s: ItemState, m: ModEntry): void {
  if (m.gen_type === "prefix") s.prefixes.push(m); else s.suffixes.push(m);
}
function remove_mod(s: ItemState, m: ModEntry): void {
  s.prefixes = s.prefixes.filter(x => x !== m);
  s.suffixes = s.suffixes.filter(x => x !== m);
}
function choose_slot(s: ItemState, omen: OmenType, rng: () => number): "prefix" | "suffix" | null {
  const op = open_prefix(s), os = open_suffix(s);
  if (omen === "sinistral" && op) return "prefix";
  if (omen === "dextral"   && os) return "suffix";
  if (op && os) return rng() < 0.5 ? "prefix" : "suffix";
  if (op) return "prefix";
  if (os) return "suffix";
  return null;
}
function draw_into(s: ItemState, pool: ModPool, slot: "prefix" | "suffix", rng: () => number): ModEntry | null {
  const pg = present_groups(s);
  const p = slot === "prefix" ? pool.prefixes : pool.suffixes;
  const m = draw(p, pg, rng);
  if (m) add_mod(s, m);
  return m;
}

export function act_transmute(s: ItemState, pool: ModPool, rng: () => number): ItemState {
  s = clone(s); s.rarity = "magic";
  const slot = choose_slot(s, null, rng);
  if (slot) draw_into(s, pool, slot, rng);
  if (rng() < 0.5 && open_prefix(s) && open_suffix(s)) {
    const slot2 = open_prefix(s) ? "prefix" : "suffix";
    draw_into(s, pool, slot2, rng);
  }
  return s;
}

export function act_augment(s: ItemState, pool: ModPool, rng: () => number): ItemState {
  s = clone(s);
  const slot = open_prefix(s) ? "prefix" : open_suffix(s) ? "suffix" : null;
  if (slot) draw_into(s, pool, slot, rng);
  return s;
}

export function act_regal(s: ItemState, pool: ModPool, rng: () => number, omen: OmenType = null): ItemState {
  s = clone(s); s.rarity = "rare";
  const slot = choose_slot(s, omen, rng);
  if (slot) draw_into(s, pool, slot, rng);
  return s;
}

export function act_alchemy(s: ItemState, pool: ModPool, rng: () => number, omen: OmenType = null): ItemState {
  s = clone(s); s.rarity = "rare";
  for (let i = 0; i < 4; i++) {
    let slot: "prefix" | "suffix" | null;
    if (omen === "sinistral" && open_prefix(s)) slot = "prefix";
    else if (omen === "dextral" && open_suffix(s)) slot = "suffix";
    else slot = choose_slot(s, null, rng);
    if (!slot) break;
    draw_into(s, pool, slot, rng);
  }
  return s;
}

export function act_exalt(s: ItemState, pool: ModPool, rng: () => number, omen: OmenType = null): ItemState {
  s = clone(s);
  if (omen === "greater") {
    const slot1 = choose_slot(s, null, rng); if (slot1) draw_into(s, pool, slot1, rng);
    const slot2 = choose_slot(s, null, rng); if (slot2) draw_into(s, pool, slot2, rng);
  } else {
    const slot = choose_slot(s, omen, rng);
    if (slot) draw_into(s, pool, slot, rng);
  }
  return s;
}

// Chaos: remove 1 mod, add 1 of SAME type (single replace, NOT full reroll)
export function act_chaos(s: ItemState, pool: ModPool, rng: () => number, omen: OmenType = null): ItemState {
  s = clone(s);
  const removable = non_fractured(s);
  if (removable.length === 0) return s;

  let removed: ModEntry;
  if (omen === "whittling") {
    removed = removable.reduce((min, m) => m.required_level < min.required_level ? m : min);
  } else if (omen === "sinistral_erasure") {
    const prefRem = s.prefixes.filter(m => !s.fractured_mod_ids.has(m.modId));
    if (prefRem.length === 0) return s;
    removed = prefRem[Math.floor(rng() * prefRem.length)];
  } else if (omen === "dextral_erasure") {
    const sufRem = s.suffixes.filter(m => !s.fractured_mod_ids.has(m.modId));
    if (sufRem.length === 0) return s;
    removed = sufRem[Math.floor(rng() * sufRem.length)];
  } else {
    removed = removable[Math.floor(rng() * removable.length)];
  }

  remove_mod(s, removed);
  const pg = present_groups(s);
  const p = removed.gen_type === "prefix" ? pool.prefixes : pool.suffixes;
  const added = draw(p, pg, rng);
  if (added) add_mod(s, added);
  return s;
}

export function act_annul(s: ItemState, rng: () => number, omen: OmenType = null): ItemState {
  s = clone(s);
  let pool = non_fractured(s);
  if (omen === "sinistral" || omen === "sinistral_annulment")
    pool = s.prefixes.filter(m => !s.fractured_mod_ids.has(m.modId));
  else if (omen === "dextral" || omen === "dextral_annulment")
    pool = s.suffixes.filter(m => !s.fractured_mod_ids.has(m.modId));
  if (pool.length === 0) return s;

  const count = omen === "greater" ? Math.min(2, pool.length) : 1;
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * pool.length);
    remove_mod(s, pool[idx]);
    pool = pool.filter((_, j) => j !== idx);
  }
  return s;
}

export function act_fracture(s: ItemState, rng: () => number): ItemState {
  s = clone(s);
  const all = all_mods(s);
  if (all.length < 4) return s;
  const target = all[Math.floor(rng() * all.length)];
  s.fractured_mod_ids.add(target.modId);
  return s;
}

export function act_essence(
  s: ItemState, pool: ModPool, rng: () => number,
  guaranteedMod: ModEntry,
  tier_type: "lesser" | "normal" | "greater" | "perfect",
  omen: OmenType = null,
): ItemState {
  s = clone(s);
  if (tier_type === "perfect") {
    let removable = non_fractured(s);
    if (omen === "sinistral_crystallisation")
      removable = s.prefixes.filter(m => !s.fractured_mod_ids.has(m.modId));
    else if (omen === "dextral_crystallisation")
      removable = s.suffixes.filter(m => !s.fractured_mod_ids.has(m.modId));
    if (removable.length > 0) remove_mod(s, removable[Math.floor(rng() * removable.length)]);
    add_mod(s, guaranteedMod);
  } else {
    s.rarity = "rare";
    s.prefixes = []; s.suffixes = [];
    add_mod(s, guaranteedMod);
    for (let i = 1; i < 4; i++) {
      const slot = choose_slot(s, null, rng);
      if (!slot) break;
      draw_into(s, pool, slot, rng);
    }
  }
  return s;
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
