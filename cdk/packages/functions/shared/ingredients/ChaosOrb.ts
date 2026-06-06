import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class ChaosOrb implements CraftingIngredient {
  readonly id = "chaos";
  readonly displayName = "Chaos Orb";

  apply(item: CraftedItem, ctx: CraftContext) {
    if (item.rarity !== "rare") return rejectedResult(item, "Chaos Orb requires a rare item");
    if (item.nonFracturedMods().length === 0) return rejectedResult(item, "Rare item has no removable affix");
    const removed = item.removeRandomAffix(ctx);
    if (!removed.removed) {
      return rejectedResult(item, "Chaos Orb could not remove an affix");
    }

    // Chaos removes one random affix, then adds one random affix into any open
    // slot; the added affix type is not bound to the removed affix type.
    const added = removed.item.addRandomAffix(ctx);
    return craftResult(added.item, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { removed: removed.removed.modId, added: added.added?.modId ?? null },
      },
    ]);
  }
}
