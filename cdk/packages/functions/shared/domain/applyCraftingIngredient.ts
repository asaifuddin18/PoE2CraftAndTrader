import type { CraftingIngredient } from "../ingredients";
import type { CraftContext } from "./CraftContext";
import type { CraftResult } from "./CraftResult";
import type { CraftedItem } from "./CraftedItem";

export function applyCraftingIngredient(
  ingredient: CraftingIngredient,
  item: CraftedItem,
  ctx: CraftContext,
): CraftResult {
  const result = ingredient.apply(item, ctx);
  if (!result.applied) {
    const state = item.toState();
    console.warn(JSON.stringify({
      event: "craft_failure",
      ingredientId: ingredient.id,
      ingredientName: ingredient.displayName,
      reason: result.events.find(event => event.type === "rejected")?.message ?? "Unknown rejection",
      rarity: state.rarity,
      prefixCount: state.prefixes.length,
      suffixCount: state.suffixes.length,
      fracturedCount: state.fractured_mod_ids.size,
      corrupted: state.corrupted,
    }));
  }
  return result;
}
