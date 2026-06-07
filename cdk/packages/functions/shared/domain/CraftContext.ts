import type { ModPool, TargetSpec } from "../types";
import type { CraftedItem } from "./CraftedItem";
import type { ModEntry } from "../types";

export type AffixSlot = "prefix" | "suffix";

export interface CraftActionHooks {
  selectAddSlot?(item: CraftedItem, availableSlots: AffixSlot[], ctx: CraftContext): AffixSlot | null;
  readonly allowAddSlotFallback?: boolean;
  filterRemoveCandidates?(item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry[];
  selectRemoveAffix?(item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null;
  modifyAddCount?(ingredientId: string, baseCount: number): number;
  modifyRemoveCount?(ingredientId: string, baseCount: number): number;
  transformAddPool?(item: CraftedItem, pool: ModPool, ctx: CraftContext): ModPool | null;
  afterSuccessfulApply?(item: CraftedItem, ctx: CraftContext): CraftedItem;
  rejectionReason?(item: CraftedItem, ctx: CraftContext): string | null;
}

export interface CraftContext {
  pool: ModPool;
  rng: () => number;
  hooks?: CraftActionHooks;
  itemLevel?: number;
  target?: TargetSpec;
}
