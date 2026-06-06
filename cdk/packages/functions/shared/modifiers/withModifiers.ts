import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import { mergeCurrency } from "../domain/CurrencyBasket";
import {
  AlchemyOrb,
  AnnulmentOrb,
  ChaosOrb,
  Essence,
  ExaltedOrb,
  RegalOrb,
  type CraftingIngredient,
} from "../ingredients";
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

      const adapted = applyCompatModifier(ingredient, modifier);
      const result = adapted.apply(item, ctx);
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

function applyCompatModifier(ingredient: CraftingIngredient, modifier: CraftingModifier): CraftingIngredient {
  const omen = modifier.toOmenType();
  switch (ingredient.id) {
    case "chaos": return new ChaosOrb(omen);
    case "alch": return new AlchemyOrb(omen);
    case "regal": return new RegalOrb(omen);
    case "exalt": return new ExaltedOrb(omen);
    case "annul": return new AnnulmentOrb(omen);
    case "essence":
      return ingredient instanceof Essence
        ? new Essence(ingredient.id, ingredient.guaranteedMod, ingredient.tier, omen)
        : ingredient;
    default: return ingredient;
  }
}
