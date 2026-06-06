import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class AugmentationOrb implements CraftingIngredient {
  readonly id = "augment";
  readonly displayName = "Orb of Augmentation";

  apply(item: CraftedItem, ctx: CraftContext) {
    const result = item.addRandomAffix(ctx);
    return craftResult(result.item, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added: result.added?.modId ?? null } },
    ]);
  }
}
