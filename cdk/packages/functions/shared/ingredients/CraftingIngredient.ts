import type { CraftContext } from "../domain/CraftContext";
import type { CraftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export interface CraftingIngredient {
  readonly id: string;
  readonly displayName: string;
  apply(item: CraftedItem, ctx: CraftContext): CraftResult;
}
