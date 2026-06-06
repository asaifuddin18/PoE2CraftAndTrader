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
      const removalContext = ctx.hooks?.selectRemoveAffix || ctx.hooks?.filterRemoveCandidates || hasOpenSlot(item, guaranteedMod)
        ? ctx
        : restrictRemovalToGuaranteedSide(ctx, guaranteedMod);
      const removed = next.removeRandomAffix(removalContext);
      if (!removed.removed || !hasOpenSlot(removed.item, guaranteedMod)) {
        return rejectedResult(item, `${this.displayName} could not create room for its guaranteed affix`);
      }
      next = removed.item.addMod(guaranteedMod);
      return craftResult(next, { [this.id]: 1 }, [
        {
          type: "currency",
          message: this.displayName,
          details: { tier: this.tier, removed: removed.removed.modId, guaranteed: guaranteedMod.modId },
        },
      ]);
    }

    if (item.rarity !== "magic") return rejectedResult(item, "Greater Essence requires a magic item");
    next = next.setRarity("rare");
    if (!hasOpenSlot(next, guaranteedMod)) {
      return rejectedResult(item, `${this.displayName} has no open slot for its guaranteed affix`);
    }
    next = next.addMod(guaranteedMod);

    return craftResult(next, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { tier: this.tier, guaranteed: guaranteedMod.modId },
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
