import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { ModEntry } from "../types";

export type EssenceTier = "lesser" | "normal" | "greater" | "perfect";

export class Essence implements CraftingIngredient {
  readonly displayName = "Essence";

  constructor(
    readonly id: string,
    readonly guaranteedMod: ModEntry,
    readonly tier: EssenceTier,
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    let next = item.clone();

    if (this.tier === "perfect") {
      const room = makeRoomForGuaranteedMod(next, this.guaranteedMod, ctx);
      next = room.item;
      const removed = room.removed ?? next.removeRandomAffix(ctx);
      next = removed.item.addMod(this.guaranteedMod);
      return craftResult(next, { [this.id]: 1 }, [
        {
          type: "currency",
          message: this.displayName,
          details: { tier: this.tier, removed: removed.removed?.modId ?? null, guaranteed: this.guaranteedMod.modId },
        },
      ]);
    }

    next = next.setRarity("rare");
    const room = makeRoomForGuaranteedMod(next, this.guaranteedMod, ctx);
    next = room.item.addMod(this.guaranteedMod);

    return craftResult(next, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { tier: this.tier, guaranteed: this.guaranteedMod.modId, removed: room.removed?.removed?.modId ?? null },
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
