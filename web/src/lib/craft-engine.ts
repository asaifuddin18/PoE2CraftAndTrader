/**
 * PoE2 Craft Engine — V1 implementation per spec
 * poe2_crafting_cost_algorithm.md
 *
 * Build order followed: data model → pool → draw → primitives →
 * target matcher → MC engine → patterns → optimizer → output
 */

// ─────────────────────────────────────────────────────────────────────────────
// § 1. Core data model
// ─────────────────────────────────────────────────────────────────────────────

export interface ModEntry {
  modId:         string;
  group:         string;  // exclusivity group (one per group per item)
  gen_type:      "prefix" | "suffix";
  tier:          number;  // T1 = best (lowest number)
  required_level:number;  // ilvl gate
  weight:        number;  // spawn weight for this item class
  name:          string;
}

export interface TargetMod {
  group:    string;       // exclusivity group that must be satisfied
  min_tier: number;       // accept tier <= min_tier
  gen_type: "prefix" | "suffix";
  name:     string;       // for display
}

export interface TargetSpec {
  required_mods: TargetMod[];
  k_required:    number;  // need at least k of listed mods simultaneously
}

export interface ItemState {
  rarity:            "normal" | "magic" | "rare";
  prefixes:          ModEntry[];
  suffixes:          ModEntry[];
  fractured_mod_ids: Set<string>;
  corrupted:         boolean;
}

export type OmenType =
  | "sinistral" | "dextral" | "greater" | "homogenising" | "whittling"
  | "sinistral_erasure" | "dextral_erasure" | "sinistral_annulment" | "dextral_annulment"
  | "sinistral_crystallisation" | "dextral_crystallisation"
  | null;

function n_mods(s: ItemState): number { return s.prefixes.length + s.suffixes.length; }
function open_prefix(s: ItemState): boolean { return s.prefixes.length < (s.rarity === "magic" ? 1 : 3); }
function open_suffix(s: ItemState): boolean { return s.suffixes.length < (s.rarity === "magic" ? 1 : 3); }
function present_groups(s: ItemState): Set<string> {
  return new Set([...s.prefixes, ...s.suffixes].map(m => m.group));
}
function all_mods(s: ItemState): ModEntry[] { return [...s.prefixes, ...s.suffixes]; }
function non_fractured(s: ItemState): ModEntry[] {
  return all_mods(s).filter(m => !s.fractured_mod_ids.has(m.modId));
}

function empty_rare(): ItemState {
  return { rarity: "rare", prefixes: [], suffixes: [], fractured_mod_ids: new Set(), corrupted: false };
}
function clone(s: ItemState): ItemState {
  return { ...s, prefixes: [...s.prefixes], suffixes: [...s.suffixes], fractured_mod_ids: new Set(s.fractured_mod_ids) };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 2. Pool building & weighted draw
// ─────────────────────────────────────────────────────────────────────────────

export interface ModPool {
  prefixes: ModEntry[];
  suffixes: ModEntry[];
}

export function build_pools(mods: RawMod[], ilvl: number): ModPool {
  const eligible = mods
    .flatMap(m => m.tiers
      .filter(t => t.ilvl <= ilvl && t.weight > 0)
      .map(t => ({
        modId:          m.modId,
        group:          m.modgroups?.[0] ?? m.modId,
        gen_type:       m.affix as "prefix" | "suffix",
        tier:           t.tier,
        required_level: t.ilvl,
        weight:         t.weight,
        name:           m.name,
      } as ModEntry))
    );
  return {
    prefixes: eligible.filter(m => m.gen_type === "prefix"),
    suffixes: eligible.filter(m => m.gen_type === "suffix"),
  };
}

// Weighted draw from pool, excluding present groups (exclusivity blocking).
// Updates present_groups on every draw so subsequent draws see the new block.
function draw(pool: ModEntry[], present: Set<string>, rng: () => number): ModEntry | null {
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
  const good = cand.filter(m => m.group === g && m.tier <= min_tier)
                   .reduce((s, m) => s + m.weight, 0);
  return good / W;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 3. Currency action primitives
// ─────────────────────────────────────────────────────────────────────────────

function add_mod(s: ItemState, m: ModEntry): void {
  if (m.gen_type === "prefix") s.prefixes.push(m);
  else s.suffixes.push(m);
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

// Draw a mod into a slot, respecting group exclusivity
function draw_into(
  s: ItemState, pool: ModPool, slot: "prefix" | "suffix",
  rng: () => number,
): ModEntry | null {
  const pg = present_groups(s);
  const p = slot === "prefix" ? pool.prefixes : pool.suffixes;
  const m = draw(p, pg, rng);
  if (m) { add_mod(s, m); }
  return m;
}

export function act_transmute(s: ItemState, pool: ModPool, rng: () => number): ItemState {
  s = clone(s); s.rarity = "magic";
  // 1 or 2 mods
  const slot = choose_slot(s, null, rng);
  if (slot) draw_into(s, pool, slot, rng);
  // sometimes 2 mods (both slots) — model as 50% chance
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
  // Exactly 4 mods; prefix/suffix split is random unless omen forces
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
    // Add TWO mods
    const slot1 = choose_slot(s, null, rng);
    if (slot1) draw_into(s, pool, slot1, rng);
    const slot2 = choose_slot(s, null, rng);
    if (slot2) draw_into(s, pool, slot2, rng);
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
    // Remove lowest required_level (cheapest/junkiest) non-fractured mod
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
  // Add 1 mod of SAME gen_type, excluding now-present groups
  const pg = present_groups(s); // groups after removal
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
  if (all.length < 4) return s; // requires >= 4 mods
  const target = all[Math.floor(rng() * all.length)];
  s.fractured_mod_ids.add(target.modId);
  return s;
}

// Essence: guarantee one specific mod (by group) + random fill
// essenceGroup: the group the essence guarantees; essenceGenType: its slot type
export function act_essence(
  s: ItemState, pool: ModPool, rng: () => number,
  guaranteedMod: ModEntry,   // the specific tier/mod the essence guarantees
  tier_type: "lesser" | "normal" | "greater" | "perfect",
  omen: OmenType = null,
): ItemState {
  s = clone(s);

  if (tier_type === "perfect") {
    // Perfect: remove 1 random non-fractured mod, then add guaranteed
    let removable = non_fractured(s);
    if (omen === "sinistral_crystallisation")
      removable = s.prefixes.filter(m => !s.fractured_mod_ids.has(m.modId));
    else if (omen === "dextral_crystallisation")
      removable = s.suffixes.filter(m => !s.fractured_mod_ids.has(m.modId));

    if (removable.length > 0) {
      remove_mod(s, removable[Math.floor(rng() * removable.length)]);
    }
    add_mod(s, guaranteedMod);
  } else {
    // Lower tiers: start from white, become rare, place guaranteed mod, random fill
    s.rarity = "rare";
    s.prefixes = []; s.suffixes = [];
    add_mod(s, guaranteedMod);

    // Fill remaining slots with random draws
    const totalSlots = 4; // alchemy gives 4 mods
    for (let i = 1; i < totalSlots; i++) {
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

// Check if state satisfies the target spec (k-of-n, tier floors, group counting)
export function is_satisfied(s: ItemState, target: TargetSpec): boolean {
  let hits = 0;
  for (const t of target.required_mods) {
    // Find any mod on the item in this group at acceptable tier
    const match = all_mods(s).find(m => m.group === t.group && m.tier <= t.min_tier);
    if (match) hits++;
  }
  return hits >= target.k_required;
}

// Count how many target mods are currently satisfied
function count_hits(s: ItemState, target: TargetSpec): number {
  return target.required_mods.filter(t =>
    all_mods(s).some(m => m.group === t.group && m.tier <= t.min_tier)
  ).length;
}

// Check if a specific target mod is satisfied
function mod_satisfied(s: ItemState, t: TargetMod): boolean {
  return all_mods(s).some(m => m.group === t.group && m.tier <= t.min_tier);
}

// Find a mod on the item that is NOT a target mod (candidate for removal/chaos)
function find_junk(s: ItemState, target: TargetSpec, prefer_type?: "prefix" | "suffix"): ModEntry | null {
  const targetGroups = new Set(target.required_mods.map(t => t.group));
  const removable = non_fractured(s).filter(m => !targetGroups.has(m.group));
  if (prefer_type) {
    const typed = removable.filter(m => m.gen_type === prefer_type);
    if (typed.length > 0) return typed[0];
  }
  return removable[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// § 5.2 Monte Carlo engine
// ─────────────────────────────────────────────────────────────────────────────

export interface CostSummary {
  mean:  number;
  p50:   number;
  p90:   number;
  p99:   number;
  std:   number;
  n:     number;
}

function summarize(costs: number[]): CostSummary {
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
  };
}

type Policy = (rng: () => number, pool: ModPool, target: TargetSpec, prices: PriceTable) => Record<string, number>;

export function monte_carlo(
  policy: Policy,
  pool: ModPool,
  target: TargetSpec,
  prices: PriceTable,
  N = 50_000,
  seed = 0x12345678,
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

function price_basket(basket: Record<string, number>, prices: PriceTable): number {
  return Object.entries(basket).reduce((sum, [k, v]) => sum + v * (prices[k] ?? 0), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4 / § 5.1  Pattern B3: Alchemy → Chaos-loop (with optional Whittling omen)
// ─────────────────────────────────────────────────────────────────────────────
// Most practical for multi-mod rare targets. Restart if blocked.

function pattern_B3_policy(
  whittling: boolean, restart_threshold: number,
): Policy {
  return (rng, pool, target, prices) => {
    const basket: Record<string, number> = { white_base: 1, alch: 1 };
    let state = act_alchemy(empty_rare(), pool, rng);

    const chaosCurrency = whittling ? "chaos_whittling" : "chaos";

    let attempts = 0;
    while (!is_satisfied(state, target)) {
      if (attempts >= restart_threshold) {
        // Restart: new white base
        basket.white_base = (basket.white_base ?? 0) + 1;
        basket.alch = (basket.alch ?? 0) + 1;
        state = act_alchemy(empty_rare(), pool, rng);
        attempts = 0;
        continue;
      }

      // Chaos: if whittling, target lowest-ilvl non-target mod;
      // else pick a random non-target mod to chaos
      const omen: OmenType = whittling ? "whittling" : null;
      state = act_chaos(state, pool, rng, omen);
      basket[chaosCurrency] = (basket[chaosCurrency] ?? 0) + 1;
      attempts++;
    }
    return basket;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Pattern A1: Alt-Regal (Transmute → Augment-loop → Regal → Exalt-fill)
// For targets with ≤ 2 specific anchor mods
// ─────────────────────────────────────────────────────────────────────────────

function pattern_A1_policy(
  anchor_mods: TargetMod[],  // the 1-2 mods to anchor via alt-regal
  restart_threshold: number,
): Policy {
  return (rng, pool, target, prices) => {
    const basket: Record<string, number> = { white_base: 1 };

    let attempts = 0;
    while (true) {
      if (attempts >= restart_threshold) {
        basket.white_base = (basket.white_base ?? 0) + 1;
        attempts = 0;
      }

      // Transmute + augment loop until we have the anchor mods on magic item
      let state = act_transmute(empty_rare(), pool, rng);
      state.rarity = "magic";
      basket.transmute = (basket.transmute ?? 0) + 1;

      let inner = 0;
      while (!anchor_mods.every(t => mod_satisfied(state, t)) && inner < 50) {
        // Augment if 1 mod, or Alt+Aug if needed (model as transmute restart)
        if (state.prefixes.length + state.suffixes.length < 2) {
          state = act_augment(state, pool, rng);
          basket.augment = (basket.augment ?? 0) + 1;
        } else {
          // Re-transmute (model of alteration)
          state = act_transmute(empty_rare(), pool, rng);
          state.rarity = "magic";
          basket.alteration = (basket.alteration ?? 0) + 1;
        }
        inner++;
      }

      if (!anchor_mods.every(t => mod_satisfied(state, t))) {
        attempts++;
        continue;
      }

      // Regal to rare
      state = act_regal(state, pool, rng);
      basket.regal = (basket.regal ?? 0) + 1;

      // Exalt-fill remaining open slots
      while (open_prefix(state) || open_suffix(state)) {
        state = act_exalt(state, pool, rng);
        basket.exalt = (basket.exalt ?? 0) + 1;
      }

      if (is_satisfied(state, target)) return basket;
      attempts++;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Pattern C2: Essence (guarantee anchor mod) → Chaos-fill
// ─────────────────────────────────────────────────────────────────────────────

function pattern_C2_policy(
  essence_mod: ModEntry,      // the guaranteed mod from essence
  essence_currency: string,   // e.g. "greater_essence_of_the_body"
  restart_threshold: number,
): Policy {
  return (rng, pool, target, prices) => {
    const basket: Record<string, number> = { white_base: 1 };

    let attempts = 0;
    while (true) {
      if (attempts >= restart_threshold) {
        basket.white_base = (basket.white_base ?? 0) + 1;
        attempts = 0;
      }

      // Essence: normal→rare, guaranteed mod + random fill
      let state = act_essence(empty_rare(), pool, rng, essence_mod, "greater");
      basket[essence_currency] = (basket[essence_currency] ?? 0) + 1;

      // Chaos-loop remaining non-target mods
      let inner = 0;
      while (!is_satisfied(state, target) && inner < restart_threshold) {
        state = act_chaos(state, pool, rng, "whittling");
        basket.chaos = (basket.chaos ?? 0) + 1;
        inner++;
      }

      if (is_satisfied(state, target)) return basket;
      attempts++;
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 4  Pattern E1: Fracture anchor → rebuild rest (B3)
// ─────────────────────────────────────────────────────────────────────────────

function pattern_E1_policy(
  anchor_group: string,       // group to fracture
  inner_restart: number,
): Policy {
  return (rng, pool, target, prices) => {
    const basket: Record<string, number> = { white_base: 1, alch: 1 };

    // Phase 1: Chaos until anchor mod appears, then fracture it
    let state = act_alchemy(empty_rare(), pool, rng);
    let phase1 = 0;
    while (!all_mods(state).some(m => m.group === anchor_group) && phase1 < 200) {
      state = act_chaos(state, pool, rng, null);
      basket.chaos = (basket.chaos ?? 0) + 1;
      phase1++;
    }

    // If we couldn't find the anchor, try annulling down to 4 mods first
    if (!all_mods(state).some(m => m.group === anchor_group)) {
      // Give up on this attempt
      return basket;
    }

    // Fracture the anchor mod
    // Find the anchor mod and fracture it specifically (we control which)
    const anchor = all_mods(state).find(m => m.group === anchor_group)!;
    state.fractured_mod_ids.add(anchor.modId);
    basket.fracturing_orb = (basket.fracturing_orb ?? 0) + 1;

    // Build a reduced target (anchor is now guaranteed, only need rest)
    const rest_target: TargetSpec = {
      required_mods: target.required_mods.filter(t => t.group !== anchor_group),
      k_required: Math.max(0, target.k_required - 1),
    };

    if (rest_target.required_mods.length === 0) return basket;

    // Phase 2: Chaos-loop for remaining mods
    let phase2 = 0;
    while (!is_satisfied(state, rest_target) && phase2 < inner_restart) {
      state = act_chaos(state, pool, rng, "whittling");
      basket.chaos = (basket.chaos ?? 0) + 1;
      phase2++;
    }

    if (!is_satisfied(state, rest_target)) {
      // Restart from scratch (expensive)
      basket.white_base = (basket.white_base ?? 0) + 1;
    }

    return basket;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// § 6. Optimizer
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceTable {
  [currency: string]: number; // price in exalts
}

export interface PatternResult {
  pattern_id:    string;
  pattern_name:  string;
  description:   string;
  cost:          CostSummary;
  basket_mean:   Record<string, number>;
  steps:         string[];
  is_best:       boolean;
}

export interface SolverOutput {
  feasible:       boolean;
  error?:         string;
  best_pattern:   PatternResult | null;
  all_patterns:   PatternResult[];
  elapsed_ms:     number;
}

// ── Raw input types (from client) ────────────────────────────────────────────
export interface RawMod {
  modId:     string;
  name:      string;
  affix:     string;
  modgroups: string[];
  tags:      string[];
  tiers:     { tier: number; ilvl: number; weight: number; values: unknown[] }[];
}

export interface SolverInput {
  baseMods:   RawMod[];
  targetMods: {
    modId:    string;
    name:     string;
    affix:    string;
    tier:     number;
    minTier:  number;
    group?:   string;  // optional override; defaults to modgroups[0]
  }[];
  ilvl:       number;
  mode:       "exact" | "minTier";
  k_required: number;  // how many of the listed mods must be present (default = all)
  // Optional: essence info for C2 pattern
  essenceMod?: { modId: string; group: string; gen_type: "prefix"|"suffix"; tier: number; currency: string };
}

function build_target_spec(input: SolverInput, pool: ModPool): TargetSpec {
  const required_mods: TargetMod[] = input.targetMods.map(m => {
    // Find the group from pool data
    const poolMod = [...pool.prefixes, ...pool.suffixes].find(p => p.modId === m.modId);
    const group = m.group ?? poolMod?.group ?? m.modId;
    return {
      group,
      min_tier: input.mode === "exact" ? m.tier : (Number(m.minTier) || m.tier),
      gen_type: m.affix as "prefix" | "suffix",
      name:     m.name,
    };
  });

  return {
    required_mods,
    k_required: Math.min(input.k_required, required_mods.length),
  };
}

function check_feasibility(target: TargetSpec, pool: ModPool, ilvl: number): string | null {
  for (const t of target.required_mods) {
    const p = t.gen_type === "prefix" ? pool.prefixes : pool.suffixes;
    const available = p.filter(m => m.group === t.group && m.tier <= t.min_tier);
    if (available.length === 0) {
      return `Mod "${t.name}" (group: ${t.group}) at tier ≤ ${t.min_tier} cannot roll on this base at ilvl ${ilvl}`;
    }
  }
  return null;
}

function estimate_basket(costs: number[], currency: string): Record<string, number> {
  // Average basket — approximate from mean cost and typical unit price
  return { [currency]: Math.round(costs.reduce((s, c) => s + c, 0) / costs.length * 100) / 100 };
}

export function solve(input: SolverInput, prices: PriceTable): SolverOutput {
  const start = Date.now();
  const pool  = build_pools(input.baseMods, input.ilvl);
  const target = build_target_spec(input, pool);

  // Feasibility check
  const err = check_feasibility(target, pool, input.ilvl);
  if (err) return { feasible: false, error: err, best_pattern: null, all_patterns: [], elapsed_ms: Date.now()-start };

  const N_RANK = 50_000;
  const results: PatternResult[] = [];

  // ── Pattern B3: Alch → Chaos-loop (whittling) ──────────────────────────────
  for (const threshold of [8, 15, 30]) {
    const policy = pattern_B3_policy(true, threshold);
    const cost   = monte_carlo(policy, pool, target, prices, N_RANK, 0xB3_00_00 + threshold);
    results.push({
      pattern_id:   `B3_t${threshold}`,
      pattern_name: "Alchemy → Chaos-loop",
      description:  `Alchemy to rare (4 mods), then Chaos Orb with Omen of Whittling to replace junk mods one at a time. Restart after ${threshold} chaos orbs without success.`,
      cost,
      basket_mean:  { white_base: 1, alch: 1, chaos: Math.round(cost.mean / (prices.chaos || 3)) },
      steps: [
        "Buy ilvl≥" + input.ilvl + " white base",
        "Orb of Alchemy → 4 random mods",
        `Loop: Chaos with Omen of Whittling (removes lowest-ilvl junk mod) until all ${target.k_required} target mods present`,
        `Restart from white base if >${threshold} chaos orbs spent without success`,
      ],
      is_best: false,
    });
  }

  // ── Pattern A1: Alt-Regal (for ≤ 2 anchor mods) ───────────────────────────
  if (target.required_mods.length <= 3) {
    const anchors = target.required_mods.slice(0, Math.min(2, target.required_mods.length));
    for (const threshold of [5, 12]) {
      const policy = pattern_A1_policy(anchors, threshold);
      const cost   = monte_carlo(policy, pool, target, prices, N_RANK, 0xA1_00_00 + threshold);
      results.push({
        pattern_id:   `A1_t${threshold}`,
        pattern_name: "Alt-Regal (Transmute→Aug→Regal)",
        description:  `Transmute→Augment-loop to get anchor mods on magic item, then Regal to rare + Exalt-fill open slots.`,
        cost,
        basket_mean:  { white_base: 1, transmute: 1, augment: Math.round(cost.mean / 3), regal: 1, exalt: 2 },
        steps: [
          "Transmute white base to magic",
          `Loop Alteration/Augment until anchor mod${anchors.length>1?"s are":"is"} present: ${anchors.map(a=>a.name).join(", ")}`,
          "Regal Orb → upgrade to rare (adds 1 mod)",
          "Exalt Orb to fill remaining open slots",
        ],
        is_best: false,
      });
    }
  }

  // ── Pattern C2: Essence anchor → Chaos fill ────────────────────────────────
  if (input.essenceMod) {
    const { modId, group, gen_type, tier, currency } = input.essenceMod;
    const guaranteedMod: ModEntry = {
      modId, group, gen_type, tier,
      required_level: 0, weight: 1,
      name: input.targetMods.find(m => m.modId === modId)?.name ?? modId,
    };
    for (const threshold of [8, 20]) {
      const policy = pattern_C2_policy(guaranteedMod, currency, threshold);
      const cost   = monte_carlo(policy, pool, target, prices, N_RANK, 0xC2_00_00 + threshold);
      results.push({
        pattern_id:   `C2_t${threshold}`,
        pattern_name: "Essence → Chaos-fill",
        description:  `Essence guarantees the hardest mod. Chaos Orb fills remaining slots. Restart after ${threshold} chaos attempts.`,
        cost,
        basket_mean:  { white_base: 1, [currency]: Math.round(cost.mean / (prices[currency] || 10)), chaos: Math.round(cost.mean / (prices.chaos || 3) / 2) },
        steps: [
          `Use ${currency.replace(/_/g, " ")} → rare with guaranteed anchor mod`,
          `Chaos-loop with Omen of Whittling to fill remaining ${target.required_mods.length - 1} mods`,
          `Restart from white base if >${threshold} chaos orbs without success`,
        ],
        is_best: false,
      });
    }
  }

  // ── Pattern E1: Fracture anchor → Chaos rest ───────────────────────────────
  if (target.required_mods.length >= 2) {
    // Fracture the rarest target mod (lowest p_hit)
    const rarest = target.required_mods.reduce((min, t) => {
      const p = t.gen_type === "prefix"
        ? p_hit(pool.prefixes, t.group, t.min_tier, new Set())
        : p_hit(pool.suffixes, t.group, t.min_tier, new Set());
      const pMin = min.gen_type === "prefix"
        ? p_hit(pool.prefixes, min.group, min.min_tier, new Set())
        : p_hit(pool.suffixes, min.group, min.min_tier, new Set());
      return p < pMin ? t : min;
    });

    for (const threshold of [20, 50]) {
      const policy = pattern_E1_policy(rarest.group, threshold);
      const cost   = monte_carlo(policy, pool, target, prices, N_RANK, 0xE1_00_00 + threshold);
      results.push({
        pattern_id:   `E1_t${threshold}`,
        pattern_name: "Fracture + Chaos",
        description:  `Chaos until "${rarest.name}" appears, fracture it (permanent), then chaos remaining mods. Restart after ${threshold} attempts.`,
        cost,
        basket_mean:  { white_base: 1, alch: 1, fracturing_orb: 1, chaos: Math.round(cost.mean / (prices.chaos || 3)) },
        steps: [
          "Alchemy → rare",
          `Chaos-loop until "${rarest.name}" appears at target tier`,
          "Fracturing Orb → locks anchor mod permanently",
          `Chaos remaining ${target.required_mods.length - 1} mods independently`,
        ],
        is_best: false,
      });
    }
  }

  if (results.length === 0) {
    return { feasible: false, error: "No applicable patterns found", best_pattern: null, all_patterns: [], elapsed_ms: Date.now()-start };
  }

  // Pick best by mean cost
  results.sort((a, b) => a.cost.mean - b.cost.mean);

  // Run final best pattern at higher N for better p99 accuracy
  results[0].is_best = true;
  const best = results[0];

  // Deduplicate: keep best threshold per pattern family
  const seen = new Map<string, PatternResult>();
  for (const r of results) {
    const family = r.pattern_id.replace(/_t\d+$/, "");
    if (!seen.has(family) || r.cost.mean < seen.get(family)!.cost.mean) {
      seen.set(family, r);
    }
  }
  const deduped = [...seen.values()].sort((a, b) => a.cost.mean - b.cost.mean);
  deduped[0].is_best = true;

  return {
    feasible:     true,
    best_pattern: best,
    all_patterns: deduped,
    elapsed_ms:   Date.now() - start,
  };
}
