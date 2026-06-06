import type { ModPool } from "../types";
import type { CraftedItem } from "./CraftedItem";
import type { ModEntry } from "../types";

export type AffixSlot = "prefix" | "suffix";

export interface CraftActionHooks {
  selectAddSlot?(item: CraftedItem, availableSlots: AffixSlot[], ctx: CraftContext): AffixSlot | null;
  selectRemoveAffix?(item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null;
  modifyAddCount?(ingredientId: string, baseCount: number): number;
  modifyRemoveCount?(ingredientId: string, baseCount: number): number;
}

export interface CraftContext {
  pool: ModPool;
  rng: () => number;
  hooks?: CraftActionHooks;
}
