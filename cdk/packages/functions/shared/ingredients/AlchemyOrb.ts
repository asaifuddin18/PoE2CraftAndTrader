import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class AlchemyOrb implements CraftingIngredient {
  readonly id = "alch";
  readonly displayName = "Orb of Alchemy";

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    if (item.rarity === "rare") return rejectedResult(item, "Orb of Alchemy requires a normal or magic item");
    let next = item.clearAffixes().setRarity("rare");
    const added: string[] = [];

    for (let i = 0; i < 4; i++) {
      const result = next.addRandomAffix(ctx);
      next = result.item;
      if (result.added) added.push(result.added.modId);
      else break;
    }
    if (added.length !== 4) {
      return rejectedResult(item, "Orb of Alchemy could not add exactly four eligible affixes");
    }

    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added } },
    ]);
  }
}
