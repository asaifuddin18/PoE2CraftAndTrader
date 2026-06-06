import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class AlchemyOrb implements CraftingIngredient {
  readonly id = "alch";
  readonly displayName = "Orb of Alchemy";

  apply(item: CraftedItem, ctx: CraftContext) {
    if (item.rarity !== "normal") return rejectedResult(item, "Orb of Alchemy requires a normal item");
    let next = item.clone().setRarity("rare");
    const added: string[] = [];

    for (let i = 0; i < 4; i++) {
      const result = next.addRandomAffix(ctx);
      next = result.item;
      if (result.added) added.push(result.added.modId);
      else break;
    }

    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added } },
    ]);
  }
}
