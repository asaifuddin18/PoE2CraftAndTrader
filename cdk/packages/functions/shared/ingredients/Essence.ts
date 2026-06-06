import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { ModEntry } from "../types";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export type EssenceTier = "greater" | "perfect";

export interface EssenceDefinition {
  id: string;
  name: string;
  tier: EssenceTier;
  byBaseId: Record<string, ModEntry[]>;
}

export class Essence implements CraftingIngredient {
  constructor(
    readonly id: string,
    readonly displayName: string,
    readonly tier: EssenceTier,
    private readonly guaranteedMods: readonly ModEntry[],
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    const guaranteedMod = this.guaranteedMods[Math.floor(ctx.rng() * this.guaranteedMods.length)];
    if (!guaranteedMod) return rejectedResult(item, `${this.displayName} is not applicable to this item type`);
    let next = item.clone();

    if (this.tier === "perfect") {
      if (item.rarity !== "rare") return rejectedResult(item, "Perfect Essence requires a rare item");
      if (item.nonFracturedMods().length === 0) return rejectedResult(item, "Rare item has no removable affix");
      const room = makeRoomForGuaranteedMod(next, guaranteedMod, ctx);
      next = room.item;
      const removed = room.removed ?? next.removeRandomAffix(ctx);
      next = removed.item.addMod(guaranteedMod);
      return craftResult(next, { [this.id]: 1 }, [
        {
          type: "currency",
          message: this.displayName,
          details: { tier: this.tier, removed: removed.removed?.modId ?? null, guaranteed: guaranteedMod.modId },
        },
      ]);
    }

    if (item.rarity === "normal") return rejectedResult(item, "Greater Essence requires a magic or rare item");
    next = next.setRarity("rare");
    const room = makeRoomForGuaranteedMod(next, guaranteedMod, ctx);
    next = room.item.addMod(guaranteedMod);

    return craftResult(next, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { tier: this.tier, guaranteed: guaranteedMod.modId, removed: room.removed?.removed?.modId ?? null },
      },
    ]);
  }
}

function makeRoomForGuaranteedMod(item: CraftedItem, guaranteedMod: ModEntry, ctx: CraftContext) {
  const state = item.toState();
  const side = guaranteedMod.gen_type;
  const sideMods = side === "prefix" ? state.prefixes : state.suffixes;
  const sideFull = sideMods.length >= (state.rarity === "magic" ? 1 : 3);

  if (!sideFull) return { item, removed: null };

  const candidates = sideMods.filter(m => !state.fractured_mod_ids.has(m.modId));
  if (candidates.length === 0) return { item, removed: null };

  const removed = candidates[Math.floor(ctx.rng() * candidates.length)];
  const next = item.removeMod(removed);
  return { item: next, removed: { item: next, removed } };
}
