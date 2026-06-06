import type { CraftingIngredient } from "../ingredients";
import type { CurrencyBasket } from "../domain/CurrencyBasket";
import type { OmenType } from "../types";

export interface CraftingModifier {
  readonly id: string;
  readonly displayName: string;
  readonly costKey: string;

  canApplyTo(ingredient: CraftingIngredient): boolean;
  cost(): CurrencyBasket;

  /**
   * Compatibility bridge for the current ingredient implementation. The next
   * pass should replace this with generic selection hooks on CraftedItem.
   */
  toOmenType(): OmenType;
}
