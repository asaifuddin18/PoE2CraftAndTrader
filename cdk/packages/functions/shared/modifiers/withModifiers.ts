import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { mergeCurrency } from "../domain/CurrencyBasket";
import type { CraftingIngredient } from "../ingredients";
import type { CraftingModifier } from "./CraftingModifier";

export function withModifiers(ingredient: CraftingIngredient, ...modifiers: CraftingModifier[]): CraftingIngredient {
  return {
    id: ingredient.id,
    displayName: ingredient.displayName,
    apply(item: CraftedItem, ctx: CraftContext) {
      if (modifiers.length > 1) {
        throw new Error("Only one crafting modifier is currently supported per ingredient use");
      }
      const modifier = modifiers[0];
      if (!modifier) return ingredient.apply(item, ctx);
      if (!modifier.canApplyTo(ingredient)) {
        throw new Error(`${modifier.displayName} cannot apply to ${ingredient.displayName}`);
      }

      const result = ingredient.apply(item, { ...ctx, hooks: modifier });
      return craftResult(
        result.item,
        mergeCurrency(result.cost, modifier.cost()),
        [
          ...result.events,
          { type: "modifier", message: `Consumed ${modifier.displayName}`, details: { modifier: modifier.id, ingredient: ingredient.id } },
        ],
      );
    },
  };
}
