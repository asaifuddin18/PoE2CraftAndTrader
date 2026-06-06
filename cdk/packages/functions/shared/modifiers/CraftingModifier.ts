import type { CraftingIngredient } from "../ingredients";
import type { CurrencyBasket } from "../domain/CurrencyBasket";
import type { CraftActionHooks } from "../domain/CraftContext";

export interface CraftingModifier extends CraftActionHooks {
  readonly id: string;
  readonly displayName: string;
  readonly costKey: string;

  canApplyTo(ingredient: CraftingIngredient): boolean;
  cost(): CurrencyBasket;
}
