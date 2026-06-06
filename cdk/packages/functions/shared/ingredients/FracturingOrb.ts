import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class FracturingOrb implements CraftingIngredient {
  readonly id = "fracturing_orb";
  readonly displayName = "Fracturing Orb";

  apply(item: CraftedItem, ctx: CraftContext) {
    const result = item.fractureRandomAffix(ctx);
    return craftResult(result.item, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { fractured: result.fractured?.modId ?? null } },
    ]);
  }
}
