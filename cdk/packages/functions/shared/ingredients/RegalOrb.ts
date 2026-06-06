import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { OmenType } from "../types";

export class RegalOrb implements CraftingIngredient {
  readonly id = "regal";
  readonly displayName = "Regal Orb";

  constructor(private readonly omen: OmenType = null) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const rare = item.clone().setRarity("rare");
    const result = rare.addRandomAffix(ctx, this.omen);
    return craftResult(result.item, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added: result.added?.modId ?? null, omen: this.omen } },
    ]);
  }
}
