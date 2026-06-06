import type { CraftedItem } from "./CraftedItem";
import type { CurrencyBasket } from "./CurrencyBasket";

export interface CraftEvent {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CraftResult {
  item: CraftedItem;
  cost: CurrencyBasket;
  events: CraftEvent[];
}

export function craftResult(item: CraftedItem, cost: CurrencyBasket = {}, events: CraftEvent[] = []): CraftResult {
  return { item, cost, events };
}
