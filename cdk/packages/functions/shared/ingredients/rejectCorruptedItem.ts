import { rejectedResult, type CraftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export function rejectCorruptedItem(item: CraftedItem): CraftResult | null {
  return item.corrupted ? rejectedResult(item, "Corrupted items cannot be modified") : null;
}
