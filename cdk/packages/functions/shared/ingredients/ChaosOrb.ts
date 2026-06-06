import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class ChaosOrb implements CraftingIngredient {
  readonly id = "chaos";
  readonly displayName = "Chaos Orb";

  apply(item: CraftedItem, ctx: CraftContext) {
    const removed = item.removeRandomAffix(ctx);
    if (!removed.removed) {
      return craftResult(removed.item, { [this.id]: 1 }, [
        { type: "currency", message: this.displayName, details: { removed: null, added: null } },
      ]);
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
