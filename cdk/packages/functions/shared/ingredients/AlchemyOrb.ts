import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { OmenType } from "../types";

export class AlchemyOrb implements CraftingIngredient {
  readonly id = "alch";
  readonly displayName = "Orb of Alchemy";

  constructor(private readonly omen: OmenType = null) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    let next = item.clone().setRarity("rare");
    const added: string[] = [];

    for (let i = 0; i < 4; i++) {
      const slot =
        this.omen === "sinistral" && next.openPrefix() ? "prefix" :
        this.omen === "dextral" && next.openSuffix() ? "suffix" :
        null;
      const result = slot
        ? next.addRandomAffixIntoSlot(ctx.pool, slot, ctx.rng)
        : next.addRandomAffix(ctx);
      next = result.item;
      if (result.added) added.push(result.added.modId);
      else break;
    }

    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added, omen: this.omen } },
    ]);
  }
}
