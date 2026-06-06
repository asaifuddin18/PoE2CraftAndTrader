import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class AnnulmentOrb implements CraftingIngredient {
  readonly id = "annul";
  readonly displayName = "Orb of Annulment";

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    if (item.rarity === "normal") return rejectedResult(item, "Orb of Annulment requires a magic or rare item");
    if (item.nonFracturedMods().length === 0) return rejectedResult(item, "Item has no removable affix");
    let next = item.clone();
    const removed: string[] = [];
    const count = ctx.hooks?.modifyRemoveCount?.(this.id, 1) ?? 1;

    for (let i = 0; i < count; i++) {
      const result = next.removeRandomAffix(ctx);
      if (!result.removed) {
        return rejectedResult(item, `${this.displayName} could not remove ${count} affixes`);
      }
      next = result.item;
      removed.push(result.removed.modId);
    }

    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { removed } },
    ]);
  }
}
