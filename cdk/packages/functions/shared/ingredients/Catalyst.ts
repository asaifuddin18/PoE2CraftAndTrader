import type { CraftContext } from "../domain/CraftContext";
import { craftResult, rejectedResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";
import type { CatalystType } from "../types";
import type { CraftingIngredient } from "./CraftingIngredient";
import { rejectCorruptedItem } from "./rejectCorruptedItem";

export class Catalyst implements CraftingIngredient {
  constructor(
    readonly id: string,
    readonly displayName: string,
    readonly catalystType: CatalystType,
  ) {}

  apply(item: CraftedItem, _ctx: CraftContext) {
    const corrupted = rejectCorruptedItem(item);
    if (corrupted) return corrupted;

    const current = item.catalyst;
    const maximum = current?.maximum ?? 20;
    const baseAmount = current?.type === this.catalystType ? current.amount : 0;
    if (baseAmount >= maximum) {
      return rejectedResult(item, `${this.displayName} quality is already at its maximum`);
    }

    const added = item.rarity === "normal" ? 5 : item.rarity === "magic" ? 2 : 1;
    const amount = Math.min(maximum, baseAmount + added);
    return craftResult(item.setCatalyst(this.catalystType, amount, maximum), { [this.id]: 1 }, [
      {
        type: "currency",
        message: this.displayName,
        details: { catalystType: this.catalystType, previousAmount: baseAmount, amount, maximum },
      },
    ]);
  }
}
