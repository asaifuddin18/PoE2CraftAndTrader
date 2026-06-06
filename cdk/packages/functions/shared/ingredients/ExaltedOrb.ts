import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { filterPoolByRequiredLevel } from "./filterPoolByRequiredLevel";

export class ExaltedOrb implements CraftingIngredient {
  constructor(
    readonly id = "exalt",
    readonly displayName = "Exalted Orb",
    readonly minimumRequiredLevel = 0,
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    if (item.rarity !== "rare") return rejectedResult(item, `${this.displayName} requires a rare item`);
    if (!item.openPrefix() && !item.openSuffix()) return rejectedResult(item, "Rare item has no open affix slot");
    let next = item.clone();
    const added: string[] = [];
    const count = ctx.hooks?.modifyAddCount?.(this.id, 1) ?? 1;
    const filteredContext = {
      ...ctx,
      pool: filterPoolByRequiredLevel(ctx.pool, this.minimumRequiredLevel),
    };

    for (let i = 0; i < count; i++) {
      const result = next.addRandomAffix(filteredContext);
      next = result.item;
      if (result.added) added.push(result.added.modId);
    }

    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added, minimumRequiredLevel: this.minimumRequiredLevel } },
    ]);
  }
}
