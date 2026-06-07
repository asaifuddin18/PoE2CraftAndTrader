import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { AffixSlot } from "../domain/CraftContext";
import type { ModEntry, TargetSpec } from "../types";
import type { CraftingIngredient } from "./CraftingIngredient";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export type DesecrationBoneKind = "jawbone" | "rib" | "collarbone" | "cranium";
export type DesecrationBoneTier = "gnawed" | "preserved" | "ancient";

export class DesecrationBone implements CraftingIngredient {
  readonly id: string;
  readonly displayName: string;

  constructor(
    readonly boneKind: DesecrationBoneKind,
    readonly tier: DesecrationBoneTier,
  ) {
    this.id = `${tier}_${boneKind}`;
    this.displayName = `${title(tier)} ${title(boneKind)}`;
  }

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    if (item.rarity !== "rare") return rejectedResult(item, `${this.displayName} requires a rare item`);
    if (this.tier === "gnawed" && (ctx.itemLevel ?? 64) > 64) {
      return rejectedResult(item, "Gnawed Bones can only be used on items up to item level 64");
    }
    if (item.hasDesecratedModifier()) return rejectedResult(item, "Item already has a Desecrated modifier");

    const selectedSlot = chooseHiddenSlot(item, ctx);
    if (!selectedSlot) return rejectedResult(item, `${this.displayName} could not choose a hidden affix slot`);
    let next = item;
    let removed: ModEntry | null = null;

    if (!hasOpenSlot(item, selectedSlot)) {
      const removal = item.removeRandomAffix({
        ...ctx,
        hooks: {
          ...ctx.hooks,
          filterRemoveCandidates: (_item, candidates) =>
            candidates.filter(candidate => candidate.gen_type === selectedSlot),
        },
      });
      if (!removal.removed) {
        return rejectedResult(item, `${this.displayName} could not remove a non-fractured ${selectedSlot}`);
      }
      removed = removal.removed;
      next = removal.item;
    }

    const hidden = hiddenDesecratedMod(selectedSlot, this.tier);
    return craftResult(next.addMod(hidden), { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { hiddenSide: selectedSlot, removed: removed?.modId ?? null },
      },
    ]);
  }
}

export class RevealDesecratedModifier implements CraftingIngredient {
  readonly id = "reveal_desecrated_modifier";
  readonly displayName = "Reveal Desecrated Modifier";

  constructor(private readonly choose?: (options: readonly ModEntry[], item: CraftedItem, ctx: CraftContext) => ModEntry) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    const hidden = item.allMods().find(mod => mod.desecrated && mod.hidden);
    if (!hidden) return rejectedResult(item, "Item has no hidden Desecrated modifier to reveal");

    const options = revealOptions(item, hidden, ctx);
    if (options.length < 3) return rejectedResult(item, "Could not generate three Desecrated reveal options");

    const selected = this.choose?.(options, item, ctx) ?? chooseBestOption(options, ctx.target);
    return craftResult(item.removeMod(hidden).addMod(selected), {}, [
      {
        type: "currency",
        message: this.displayName,
        details: { hidden: hidden.modId, options: options.map(option => option.modId), selected: selected.modId },
      },
    ]);
  }
}

function chooseHiddenSlot(item: CraftedItem, ctx: CraftContext): AffixSlot | null {
  const open: AffixSlot[] = [];
  if (item.openPrefix()) open.push("prefix");
  if (item.openSuffix()) open.push("suffix");
  if (open.length > 0) return open[Math.floor(ctx.rng() * open.length)];

  const removable = item.nonFracturedMods();
  if (removable.length === 0) return null;
  const selected = removable[Math.floor(ctx.rng() * removable.length)];
  return selected.gen_type;
}

function hasOpenSlot(item: CraftedItem, slot: AffixSlot): boolean {
  return slot === "prefix" ? item.openPrefix() : item.openSuffix();
}

function hiddenDesecratedMod(slot: AffixSlot, tier: DesecrationBoneTier): ModEntry {
  return {
    modId: `hidden_desecrated_${slot}`,
    group: `hidden_desecrated_${slot}`,
    gen_type: slot,
    tier: 1,
    required_level: 1,
    weight: 1,
    name: "Hidden Desecrated Modifier",
    desecrated: true,
    hidden: true,
    tags: ["Desecrated"],
    desecrationTier: tier,
  };
}

function revealOptions(item: CraftedItem, hidden: ModEntry, ctx: CraftContext): ModEntry[] {
  const pool = hidden.gen_type === "prefix" ? ctx.pool.prefixes : ctx.pool.suffixes;
  const present = item.presentGroups();
  present.delete(hidden.group);
  const candidates = pool
    .filter(mod => !present.has(mod.group))
    .filter(mod => mod.gen_type === hidden.gen_type)
    .filter(mod => (ctx.itemLevel ?? Number.POSITIVE_INFINITY) >= mod.required_level)
    .filter(mod => mod.required_level >= ancientMinimum(hidden))
    .map(toDesecratedReveal);

  return drawUnique(candidates, 3, ctx.rng);
}

function ancientMinimum(hidden: ModEntry): number {
  return hidden.desecrationTier === "ancient" ? 40 : 0;
}

function toDesecratedReveal(mod: ModEntry): ModEntry {
  const family = mod.tags?.find(tag => tag === "Ulaman" || tag === "Amanamu" || tag === "Kurgal") as ModEntry["abyssFamily"];
  return { ...mod, modId: `desecrated_${mod.modId}`, desecrated: true, hidden: false, abyssFamily: family };
}

function drawUnique(candidates: ModEntry[], count: number, rng: () => number): ModEntry[] {
  const remaining = [...candidates];
  const selected: ModEntry[] = [];
  while (selected.length < count && remaining.length > 0) {
    const weight = remaining.reduce((sum, mod) => sum + mod.weight, 0);
    if (weight <= 0) break;
    let r = rng() * weight;
    const index = remaining.findIndex(mod => {
      r -= mod.weight;
      return r <= 0;
    });
    selected.push(...remaining.splice(index >= 0 ? index : remaining.length - 1, 1));
  }
  return selected;
}

function chooseBestOption(options: readonly ModEntry[], target?: TargetSpec): ModEntry {
  if (!target) return options[0];
  return [...options].sort((a, b) => score(b, target) - score(a, target))[0] ?? options[0];
}

function score(option: ModEntry, target: TargetSpec): number {
  return target.required_mods.some(targetMod =>
    targetMod.group === option.group && option.tier <= targetMod.min_tier)
    ? 1
    : 0;
}

function title(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
