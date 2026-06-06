import type { AffixSlot, CraftActionHooks, CraftContext } from "./CraftContext";
import type { ModEntry, ItemState, ModPool } from "../types";

export class CraftedItem {
  private constructor(private readonly s: ItemState) {}

  static fromState(state: ItemState): CraftedItem {
    return new CraftedItem(cloneState(state));
  }

  static emptyRare(): CraftedItem {
    return new CraftedItem({
      rarity: "rare",
      prefixes: [],
      suffixes: [],
      fractured_mod_ids: new Set(),
      corrupted: false,
    });
  }

  toState(): ItemState {
    return cloneState(this.s);
  }

  clone(): CraftedItem {
    return new CraftedItem(cloneState(this.s));
  }

  get rarity(): ItemState["rarity"] { return this.s.rarity; }
  get prefixes(): ModEntry[] { return [...this.s.prefixes]; }
  get suffixes(): ModEntry[] { return [...this.s.suffixes]; }
  get fracturedModIds(): ReadonlySet<string> { return new Set(this.s.fractured_mod_ids); }
  get corrupted(): boolean { return this.s.corrupted; }

  nMods(): number {
    return this.s.prefixes.length + this.s.suffixes.length;
  }

  openPrefix(): boolean {
    return this.s.prefixes.length < this.maxAffixesPerSide();
  }

  openSuffix(): boolean {
    return this.s.suffixes.length < this.maxAffixesPerSide();
  }

  allMods(): ModEntry[] {
    return [...this.s.prefixes, ...this.s.suffixes];
  }

  nonFracturedMods(): ModEntry[] {
    return this.allMods().filter(m => !this.s.fractured_mod_ids.has(m.modId));
  }

  presentGroups(): Set<string> {
    return new Set(this.allMods().map(m => m.group));
  }

  setRarity(rarity: ItemState["rarity"]): CraftedItem {
    const next = this.clone();
    next.s.rarity = rarity;
    return next;
  }

  clearAffixes(): CraftedItem {
    const next = this.clone();
    next.s.prefixes = [];
    next.s.suffixes = [];
    return next;
  }

  addMod(mod: ModEntry): CraftedItem {
    const next = this.clone();
    if (mod.gen_type === "prefix") {
      if (!next.openPrefix()) return next;
      next.s.prefixes.push(mod);
    } else {
      if (!next.openSuffix()) return next;
      next.s.suffixes.push(mod);
    }
    return next;
  }

  removeMod(mod: ModEntry): CraftedItem {
    const next = this.clone();
    next.s.prefixes = next.s.prefixes.filter(x => x !== mod);
    next.s.suffixes = next.s.suffixes.filter(x => x !== mod);
    return next;
  }

  addRandomAffix(ctx: CraftContext, hooks: CraftActionHooks | undefined = ctx.hooks): { item: CraftedItem; added: ModEntry | null } {
    const slot = this.chooseSlot(ctx, hooks);
    if (!slot) return { item: this.clone(), added: null };
    return this.addRandomAffixIntoSlot(ctx.pool, slot, ctx.rng);
  }

  addRandomAffixIntoSlot(pool: ModPool, slot: AffixSlot, rng: () => number): { item: CraftedItem; added: ModEntry | null } {
    const p = slot === "prefix" ? pool.prefixes : pool.suffixes;
    const added = draw(p, this.presentGroups(), rng);
    return { item: added ? this.addMod(added) : this.clone(), added };
  }

  removeRandomAffix(ctx: CraftContext, hooks: CraftActionHooks | undefined = ctx.hooks): { item: CraftedItem; removed: ModEntry | null } {
    const removed = this.chooseRemovableAffix(ctx, hooks);
    if (!removed) return { item: this.clone(), removed: null };
    return { item: this.removeMod(removed), removed };
  }

  fractureRandomAffix(ctx: CraftContext): { item: CraftedItem; fractured: ModEntry | null } {
    const next = this.clone();
    if (next.s.fractured_mod_ids.size > 0) return { item: next, fractured: null };
    const mods = next.allMods();
    if (mods.length < 4) return { item: next, fractured: null };
    const fractured = mods[Math.floor(ctx.rng() * mods.length)];
    next.s.fractured_mod_ids.add(fractured.modId);
    return { item: next, fractured };
  }

  private maxAffixesPerSide(): number {
    if (this.s.rarity === "magic") return 1;
    if (this.s.rarity === "normal") return 0;
    return 3;
  }

  private chooseSlot(ctx: CraftContext, hooks?: CraftActionHooks): AffixSlot | null {
    const available = this.availableSlots();
    if (available.length === 0) return null;
    const hooked = hooks?.selectAddSlot?.(this, available, ctx);
    if (hooked && available.includes(hooked)) return hooked;
    return available[Math.floor(ctx.rng() * available.length)];
  }

  private availableSlots(): AffixSlot[] {
    const slots: AffixSlot[] = [];
    const op = this.openPrefix();
    const os = this.openSuffix();
    if (op) slots.push("prefix");
    if (os) slots.push("suffix");
    return slots;
  }

  private chooseRemovableAffix(ctx: CraftContext, hooks?: CraftActionHooks): ModEntry | null {
    const removable = this.nonFracturedMods();
    if (removable.length === 0) return null;
    const hooked = hooks?.selectRemoveAffix?.(this, removable, ctx);
    if (hooked && removable.includes(hooked)) return hooked;
    return removable[Math.floor(ctx.rng() * removable.length)];
  }
}

export function cloneState(s: ItemState): ItemState {
  return {
    ...s,
    prefixes: [...s.prefixes],
    suffixes: [...s.suffixes],
    fractured_mod_ids: new Set(s.fractured_mod_ids),
  };
}

export function draw(pool: ModEntry[], present: Set<string>, rng: () => number): ModEntry | null {
  const candidates = pool.filter(m => !present.has(m.group));
  const weight = candidates.reduce((sum, m) => sum + m.weight, 0);
  if (weight === 0) return null;

  let r = rng() * weight;
  for (const mod of candidates) {
    r -= mod.weight;
    if (r <= 0) return mod;
  }
  return candidates[candidates.length - 1];
}
