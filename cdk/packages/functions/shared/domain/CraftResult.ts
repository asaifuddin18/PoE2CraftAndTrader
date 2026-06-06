import type { CraftedItem } from "./CraftedItem";
import type { CurrencyBasket } from "./CurrencyBasket";

export interface CraftEvent {
  type: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface CraftResult {
  applied: boolean;
  item: CraftedItem;
  cost: CurrencyBasket;
  events: CraftEvent[];
}

export function craftResult(item: CraftedItem, cost: CurrencyBasket = {}, events: CraftEvent[] = []): CraftResult {
  return { applied: true, item, cost, events };
}

export function rejectedResult(item: CraftedItem, message: string): CraftResult {
  return {
    applied: false,
    item: item.clone(),
    cost: {},
    events: [{ type: "rejected", message }],
  };
}
