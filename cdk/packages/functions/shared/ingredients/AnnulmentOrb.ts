import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { OmenType } from "../types";

export class AnnulmentOrb implements CraftingIngredient {
  readonly id = "annul";
  readonly displayName = "Orb of Annulment";

  constructor(private readonly omen: OmenType = null) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    let next = item.clone();
    const removed: string[] = [];
    const count = this.omen === "greater" ? Math.min(2, next.nonFracturedMods().length) : 1;

    for (let i = 0; i < count; i++) {
      const result = next.removeRandomAffix(ctx, this.omen);
      next = result.item;
      if (result.removed) removed.push(result.removed.modId);
    }

    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { removed, omen: this.omen } },
    ]);
  }
}
