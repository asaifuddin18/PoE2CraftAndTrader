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

  if (modifiers.some(modifier => modifier.putrefyDesecration) && modifiers.length > 1) {
    throw new Error("Omen of Putrefaction cannot be combined with another omen");
  }

  for (const hook of [
    "selectAddSlot",
    "filterRemoveCandidates",
    "selectRemoveAffix",
    "selectDesecrationSlot",
    "guaranteedDesecrationFamily",
    "extraDesecrationRevealOptions",
  ] as const) {
    const selectors = modifiers.filter(modifier => modifier[hook]);
    if (selectors.length > 1) {
      throw new Error(`${selectors.map(modifier => modifier.displayName).join(" and ")} cannot be combined`);
    }
  }
}

function composeHooks(modifiers: CraftingModifier[]): CraftActionHooks {
  const addSelector = modifiers.find(modifier => modifier.selectAddSlot)?.selectAddSlot;
  const removeFilter = modifiers.find(modifier => modifier.filterRemoveCandidates)?.filterRemoveCandidates;
  const removeSelector = modifiers.find(modifier => modifier.selectRemoveAffix)?.selectRemoveAffix;
  const poolTransforms = modifiers.flatMap(modifier => modifier.transformAddPool ? [modifier.transformAddPool.bind(modifier)] : []);
  const afterApplyHooks = modifiers.flatMap(modifier => modifier.afterSuccessfulApply ? [modifier.afterSuccessfulApply.bind(modifier)] : []);
  const rejectionHooks = modifiers.flatMap(modifier => modifier.rejectionReason ? [modifier.rejectionReason.bind(modifier)] : []);
  const desecrationSlotModifier = modifiers.find(modifier => modifier.selectDesecrationSlot);
  const familyModifier = modifiers.find(modifier => modifier.guaranteedDesecrationFamily);
  const revealOptionsModifier = modifiers.find(modifier => modifier.extraDesecrationRevealOptions);

  return {
    selectAddSlot: addSelector,
    allowAddSlotFallback: modifiers.some(modifier => modifier.allowAddSlotFallback),
    filterRemoveCandidates: removeFilter,
    selectRemoveAffix: removeSelector,
    transformAddPool(item, pool, ctx) {
      return poolTransforms.reduce<ReturnType<NonNullable<CraftActionHooks["transformAddPool"]>>>(
        (current, transform) => current ? transform(item, current, ctx) : null,
        pool,
      );
    },
    afterSuccessfulApply(item, ctx) {
      return afterApplyHooks.reduce((current, apply) => apply(current, ctx), item);
    },
    rejectionReason(item, ctx) {
      for (const reject of rejectionHooks) {
        const reason = reject(item, ctx);
        if (reason) return reason;
      }
      return null;
    },
    selectDesecrationSlot: desecrationSlotModifier?.selectDesecrationSlot?.bind(desecrationSlotModifier),
    guaranteedDesecrationFamily: familyModifier?.guaranteedDesecrationFamily?.bind(familyModifier),
    extraDesecrationRevealOptions: revealOptionsModifier?.extraDesecrationRevealOptions?.bind(revealOptionsModifier),
    putrefyDesecration: modifiers.some(modifier => modifier.putrefyDesecration),
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
