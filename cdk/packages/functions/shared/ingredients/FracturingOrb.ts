import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class FracturingOrb implements CraftingIngredient {
  readonly id = "fracturing_orb";
  readonly displayName = "Fracturing Orb";

  apply(item: CraftedItem, ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;
    if (item.rarity !== "rare") return rejectedResult(item, "Fracturing Orb requires a rare item");
    if (item.nMods() < 4) return rejectedResult(item, "Fracturing Orb requires at least four affixes");
    if (item.fracturedModIds.size > 0) return rejectedResult(item, "Item already has a fractured affix");
    const result = item.fractureRandomAffix(ctx);
    return craftResult(result.item, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { fractured: result.fractured?.modId ?? null } },
    ]);
  }
}
