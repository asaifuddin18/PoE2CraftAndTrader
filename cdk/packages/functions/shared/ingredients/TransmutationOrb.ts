import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class TransmutationOrb implements CraftingIngredient {
  readonly id = "transmute";
  readonly displayName = "Orb of Transmutation";

  apply(item: CraftedItem, ctx: CraftContext) {
    if (item.rarity !== "normal") return rejectedResult(item, "Orb of Transmutation requires a normal item");
    let next = item.clone().setRarity("magic");
    let result = next.addRandomAffix(ctx);
    next = result.item;

    // Preserve current solver behavior: transmute creates one magic affix here;
    // Augment is responsible for the second magic affix in A1.
    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added: result.added?.modId ?? null } },
    ]);
  }
}
