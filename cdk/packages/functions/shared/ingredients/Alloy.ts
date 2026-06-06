import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { ModEntry } from "../types";
import { guaranteedModifierAlreadyPresent } from "./guaranteedModifierAlreadyPresent";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class Alloy implements CraftingIngredient {
  constructor(
    readonly id: string,
    readonly displayName: string,
    readonly guaranteedMod: ModEntry,
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    if (item.rarity !== "rare") return rejectedResult(item, `${this.displayName} requires a rare item`);
    if (guaranteedModifierAlreadyPresent(item, this.guaranteedMod)) {
      return rejectedResult(item, `${this.displayName}'s guaranteed modifier is already present`);
    }
    if (item.nonFracturedMods().length === 0) {
      return rejectedResult(item, `${this.displayName} requires a removable affix`);
    }

    const removalContext = hasOpenSlot(item, this.guaranteedMod)
      ? ctx
      : restrictRemovalToGuaranteedSide(ctx, this.guaranteedMod);
    const removed = item.removeRandomAffix(removalContext);
    if (!removed.removed || !hasOpenSlot(removed.item, this.guaranteedMod)) {
      return rejectedResult(item, `${this.displayName} could not create room for its guaranteed affix`);
    }

    const next = removed.item.addMod(this.guaranteedMod);
    return craftResult(next, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { removed: removed.removed.modId, guaranteed: this.guaranteedMod.modId },
      },
    ]);
  }
}

function hasOpenSlot(item: CraftedItem, guaranteedMod: ModEntry): boolean {
  return guaranteedMod.gen_type === "prefix" ? item.openPrefix() : item.openSuffix();
}

function restrictRemovalToGuaranteedSide(ctx: CraftContext, guaranteedMod: ModEntry): CraftContext {
  return {
    ...ctx,
    hooks: {
      ...ctx.hooks,
      filterRemoveCandidates: (_item, candidates) =>
        candidates.filter(candidate => candidate.gen_type === guaranteedMod.gen_type),
    },
  };
}
