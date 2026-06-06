import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { filterPoolByRequiredLevel } from "./filterPoolByRequiredLevel";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class ChaosOrb implements CraftingIngredient {
  constructor(
    readonly id = "chaos",
    readonly displayName = "Chaos Orb",
    readonly minimumRequiredLevel = 0,
  ) {}

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    if (item.rarity !== "rare") return rejectedResult(item, "Chaos Orb requires a rare item");
    if (item.nonFracturedMods().length === 0) return rejectedResult(item, "Rare item has no removable affix");
    const removed = item.removeRandomAffix(ctx);
    if (!removed.removed) {
      return rejectedResult(item, "Chaos Orb could not remove an affix");
    }

    // Chaos removes one random affix, then adds one random affix into any open
    // slot; the added affix type is not bound to the removed affix type.
    const added = removed.item.addRandomAffix({
      ...ctx,
      pool: filterPoolByRequiredLevel(ctx.pool, this.minimumRequiredLevel),
    });
    if (!added.added) return rejectedResult(item, `${this.displayName} could not add an eligible replacement affix`);
    return craftResult(added.item, { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: {
          removed: removed.removed.modId,
          added: added.added.modId,
          minimumRequiredLevel: this.minimumRequiredLevel,
        },
      },
    ]);
  }
}
