import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class AnnulmentOrb implements CraftingIngredient {
  readonly id = "annul";
  readonly displayName = "Orb of Annulment";

  apply(item: CraftedItem, ctx: CraftContext) {
    if (item.rarity !== "rare") return rejectedResult(item, "Orb of Annulment requires a rare item");
    if (item.nonFracturedMods().length === 0) return rejectedResult(item, "Rare item has no removable affix");
    let next = item.clone();
    const removed: string[] = [];
    const count = Math.min(
      ctx.hooks?.modifyRemoveCount?.(this.id, 1) ?? 1,
      next.nonFracturedMods().length,
    );

    for (let i = 0; i < count; i++) {
      const result = next.removeRandomAffix(ctx);
      next = result.item;
      if (result.removed) removed.push(result.removed.modId);
    }

    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { removed } },
    ]);
  }
}
