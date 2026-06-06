import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { filterPoolByRequiredLevel } from "./filterPoolByRequiredLevel";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class AugmentationOrb implements CraftingIngredient {
  constructor(
    readonly id = "augment",
    readonly displayName = "Orb of Augmentation",
    readonly minimumRequiredLevel = 0,
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    if (item.rarity !== "magic") return rejectedResult(item, "Orb of Augmentation requires a magic item");
    if (item.nMods() !== 1) return rejectedResult(item, "Orb of Augmentation requires a magic item with exactly one affix");
    const result = item.addRandomAffix({
      ...ctx,
      pool: filterPoolByRequiredLevel(ctx.pool, this.minimumRequiredLevel),
    });
    if (!result.added) return rejectedResult(item, `${this.displayName} could not add an eligible affix`);
    return craftResult(result.item, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { added: result.added.modId, minimumRequiredLevel: this.minimumRequiredLevel },
      },
    ]);
  }
}
