import type { CraftActionHooks, CraftContext } from "../domain/CraftContext";
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
      if (modifiers.length === 0) return ingredient.apply(item, ctx);
      for (const modifier of modifiers) {
        if (!modifier.canApplyTo(ingredient)) {
          throw new Error(`${modifier.displayName} cannot apply to ${ingredient.displayName}`);
        }
      }
      assertComposable(modifiers);

      const result = ingredient.apply(item, { ...ctx, hooks: composeHooks(modifiers) });
      if (!result.applied) return result;
      return craftResult(
        result.item,
        modifiers.reduce((cost, modifier) => mergeCurrency(cost, modifier.cost()), result.cost),
        [
          ...result.events,
          ...modifiers.map(modifier => ({
            type: "modifier" as const,
            message: `Consumed ${modifier.displayName}`,
            details: { modifier: modifier.id, ingredient: ingredient.id },
          })),
        ],
      );
    },
  };
}

function assertComposable(modifiers: CraftingModifier[]): void {
  const duplicate = modifiers.find((modifier, index) =>
    modifiers.findIndex(candidate => candidate.id === modifier.id) !== index);
  if (duplicate) throw new Error(`${duplicate.displayName} cannot be used more than once`);

  for (const hook of ["selectAddSlot", "selectRemoveAffix"] as const) {
    const selectors = modifiers.filter(modifier => modifier[hook]);
    if (selectors.length > 1) {
      throw new Error(`${selectors.map(modifier => modifier.displayName).join(" and ")} cannot be combined`);
    }
  }
}

function composeHooks(modifiers: CraftingModifier[]): CraftActionHooks {
  const addSelector = modifiers.find(modifier => modifier.selectAddSlot)?.selectAddSlot;
  const removeSelector = modifiers.find(modifier => modifier.selectRemoveAffix)?.selectRemoveAffix;

  return {
    selectAddSlot: addSelector,
    allowAddSlotFallback: modifiers.some(modifier => modifier.allowAddSlotFallback),
    selectRemoveAffix: removeSelector,
    modifyAddCount(ingredientId, baseCount) {
      return modifiers.reduce(
        (count, modifier) => modifier.modifyAddCount?.(ingredientId, count) ?? count,
        baseCount,
      );
    },
    modifyRemoveCount(ingredientId, baseCount) {
      return modifiers.reduce(
        (count, modifier) => modifier.modifyRemoveCount?.(ingredientId, count) ?? count,
        baseCount,
      );
    },
  };
}
