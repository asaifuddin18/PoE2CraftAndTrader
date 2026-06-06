import type { CraftingIngredient } from "./CraftingIngredient";
import type { CraftContext } from "../domain/CraftContext";
import { craftResult } from "../domain/CraftResult";
import type { CraftedItem } from "../domain/CraftedItem";

export class ExaltedOrb implements CraftingIngredient {
  readonly id = "exalt";
  readonly displayName = "Exalted Orb";

  apply(item: CraftedItem, ctx: CraftContext) {
    let next = item.clone();
    const added: string[] = [];
    const count = ctx.hooks?.modifyAddCount?.(this.id, 1) ?? 1;

    for (let i = 0; i < count; i++) {
      const result = next.addRandomAffix(ctx);
      next = result.item;
      if (result.added) added.push(result.added.modId);
    }

    return craftResult(next, { [this.id]: 1 }, [
      { type: "currency", message: this.displayName, details: { added } },
    ]);
  }
}
