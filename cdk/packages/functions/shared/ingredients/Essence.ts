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
      const removed = next.removeRandomAffix(ctx);
      next = removed.item.addMod(this.guaranteedMod);
      return craftResult(next, { [this.id]: 1 }, [
        {
          type: "currency",
          message: this.displayName,
          details: { tier: this.tier, removed: removed.removed?.modId ?? null, guaranteed: this.guaranteedMod.modId },
        },
      ]);
    }

    next = next.setRarity("rare").clearAffixes().addMod(this.guaranteedMod);
    const added: string[] = [];
    for (let i = 1; i < 4; i++) {
      const result = next.addRandomAffix(ctx);
      next = result.item;
      if (result.added) added.push(result.added.modId);
      else break;
    }

    return craftResult(next, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { tier: this.tier, guaranteed: this.guaranteedMod.modId, added },
      },
    ]);
  }
}
