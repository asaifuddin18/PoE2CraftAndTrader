import type { CraftedItem } from "../domain/CraftedItem";
import type { ModEntry } from "../types";

export function guaranteedModifierAlreadyPresent(item: CraftedItem, guaranteedMod: ModEntry): boolean {
  return item.presentGroups().has(guaranteedMod.group);
}
