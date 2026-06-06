import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { OmenType } from "../types";
import type { CurrencyBasket } from "../domain/CurrencyBasket";

export class ChaosOrb implements CraftingIngredient {
  readonly id = "chaos";
  readonly displayName = "Chaos Orb";

  constructor(private readonly omen: OmenType = null) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const cost: CurrencyBasket = this.omen === "whittling"
      ? { [this.id]: 1, omen_whittling: 1 }
      : { [this.id]: 1 };

    const removed = item.removeRandomAffix(ctx, this.omen);
    if (!removed.removed) {
      return craftResult(removed.item, cost, [
        { type: "currency", message: this.displayName, details: { removed: null, added: null, omen: this.omen } },
      ]);
    }

    // Chaos removes one random affix, then adds one random affix into any open
    // slot; the added affix type is not bound to the removed affix type.
    const added = removed.item.addRandomAffix(ctx);
    return craftResult(added.item, cost, [
      {
        type: "currency",
        message: this.displayName,
        details: { removed: removed.removed.modId, added: added.added?.modId ?? null, omen: this.omen },
      },
    ]);
  }
}
