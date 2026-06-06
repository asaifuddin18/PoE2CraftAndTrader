import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class RegalOrb implements CraftingIngredient {
  readonly id = "regal";
  readonly displayName = "Regal Orb";

  apply(item: CraftedItem, ctx: CraftContext) {
    if (item.rarity !== "magic") return rejectedResult(item, "Regal Orb requires a magic item");
    const rare = item.clone().setRarity("rare");
    const result = rare.addRandomAffix(ctx);
    return craftResult(result.item, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added: result.added?.modId ?? null } },
    ]);
  }
}
