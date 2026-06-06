import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { filterPoolByRequiredLevel } from "./filterPoolByRequiredLevel";

export class AugmentationOrb implements CraftingIngredient {
  constructor(
    readonly id = "augment",
    readonly displayName = "Orb of Augmentation",
    readonly minimumRequiredLevel = 0,
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    if (item.rarity !== "magic") return rejectedResult(item, "Orb of Augmentation requires a magic item");
    if (!item.openPrefix() && !item.openSuffix()) return rejectedResult(item, "Magic item has no open affix slot");
    const result = item.addRandomAffix({
      ...ctx,
      pool: filterPoolByRequiredLevel(ctx.pool, this.minimumRequiredLevel),
    });
    return craftResult(result.item, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { added: result.added?.modId ?? null, minimumRequiredLevel: this.minimumRequiredLevel },
      },
    ]);
  }
}
