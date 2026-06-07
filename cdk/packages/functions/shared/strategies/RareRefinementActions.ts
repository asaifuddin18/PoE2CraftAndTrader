import type { CurrencyBasket } from "../domain/CurrencyBasket";
import type { CraftedItem } from "../domain/CraftedItem";
import type { CraftingIngredient } from "../ingredients";
import {
  AnnulmentOrb,
  ChaosOrb,
  ExaltedOrb,
  GreaterChaosOrb,
  GreaterExaltedOrb,
  PerfectChaosOrb,
  PerfectExaltedOrb,
} from "../ingredients";
import {
  OmenOfDextralAnnulment,
  OmenOfDextralErasure,
  OmenOfDextralExaltation,
  OmenOfGreaterAnnulment,
  OmenOfGreaterExaltation,
  OmenOfSinistralAnnulment,
  OmenOfSinistralErasure,
  OmenOfSinistralExaltation,
  OmenOfWhittling,
  withModifiers,
} from "../modifiers";
import type { CraftContext } from "../domain/CraftContext";
import type { CraftResult } from "../domain/CraftResult";

export interface RefinementAction {
  readonly id: string;
  readonly name: string;
  apply(item: CraftedItem, ctx: CraftContext): CraftResult;
}

function ingredientAction(id: string, name: string, ingredient: CraftingIngredient): RefinementAction {
  return { id, name, apply: (item, ctx) => ingredient.apply(item, ctx) };
}

export const REFINEMENT_ACTIONS: readonly RefinementAction[] = [
  ingredientAction("exalt", "Exalted Orb", new ExaltedOrb()),
  ingredientAction("greater_exalt", "Greater Exalted Orb", new GreaterExaltedOrb()),
  ingredientAction("perfect_exalt", "Perfect Exalted Orb", new PerfectExaltedOrb()),
  ingredientAction("exalt_greater_omen", "Exalted Orb + Omen of Greater Exaltation", withModifiers(new ExaltedOrb(), new OmenOfGreaterExaltation())),
  ingredientAction("exalt_prefix", "Exalted Orb + Omen of Sinistral Exaltation", withModifiers(new ExaltedOrb(), new OmenOfSinistralExaltation())),
  ingredientAction("exalt_suffix", "Exalted Orb + Omen of Dextral Exaltation", withModifiers(new ExaltedOrb(), new OmenOfDextralExaltation())),
  ingredientAction("chaos", "Chaos Orb", new ChaosOrb()),
  ingredientAction("greater_chaos", "Greater Chaos Orb", new GreaterChaosOrb()),
  ingredientAction("perfect_chaos", "Perfect Chaos Orb", new PerfectChaosOrb()),
  ingredientAction("chaos_whittling", "Chaos Orb + Omen of Whittling", withModifiers(new ChaosOrb(), new OmenOfWhittling())),
  ingredientAction("chaos_remove_prefix", "Chaos Orb + Omen of Sinistral Erasure", withModifiers(new ChaosOrb(), new OmenOfSinistralErasure())),
  ingredientAction("chaos_remove_suffix", "Chaos Orb + Omen of Dextral Erasure", withModifiers(new ChaosOrb(), new OmenOfDextralErasure())),
  ingredientAction("annul", "Orb of Annulment", new AnnulmentOrb()),
  ingredientAction("annul_greater", "Orb of Annulment + Omen of Greater Annulment", withModifiers(new AnnulmentOrb(), new OmenOfGreaterAnnulment())),
  ingredientAction("annul_prefix", "Orb of Annulment + Omen of Sinistral Annulment", withModifiers(new AnnulmentOrb(), new OmenOfSinistralAnnulment())),
  ingredientAction("annul_suffix", "Orb of Annulment + Omen of Dextral Annulment", withModifiers(new AnnulmentOrb(), new OmenOfDextralAnnulment())),
];

export function basketPrice(basket: CurrencyBasket, prices: Record<string, number>): number {
  return Object.entries(basket).reduce((sum, [currency, count]) => sum + count * (prices[currency] ?? 0), 0);
}
