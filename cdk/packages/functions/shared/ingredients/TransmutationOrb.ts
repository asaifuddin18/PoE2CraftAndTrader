import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { filterPoolByRequiredLevel } from "./filterPoolByRequiredLevel";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class TransmutationOrb implements CraftingIngredient {
  constructor(
    readonly id = "transmute",
    readonly displayName = "Orb of Transmutation",
    readonly minimumRequiredLevel = 0,
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    if (item.rarity !== "normal") return rejectedResult(item, "Orb of Transmutation requires a normal item");
    const magic = item.clone().setRarity("magic");
    const result = magic.addRandomAffix({
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
