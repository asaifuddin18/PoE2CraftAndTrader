import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { filterPoolByRequiredLevel } from "./filterPoolByRequiredLevel";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class ExaltedOrb implements CraftingIngredient {
  constructor(
    readonly id = "exalt",
    readonly displayName = "Exalted Orb",
    readonly minimumRequiredLevel = 0,
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    const rejectionReason = ctx.hooks?.rejectionReason?.(item, ctx);
    if (rejectionReason) return rejectedResult(item, rejectionReason);
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
      if (!result.added) {
        return rejectedResult(item, `${this.displayName} could not add ${count} eligible affixes`);
      }
      next = result.item;
      added.push(result.added.modId);
    }

    next = ctx.hooks?.afterSuccessfulApply?.(next, ctx) ?? next;
    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added, minimumRequiredLevel: this.minimumRequiredLevel } },
    ]);
  }
}
