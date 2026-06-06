import type { CraftingIngredient } from "../ingredients";
import type { CurrencyBasket } from "../domain/CurrencyBasket";
import type { CraftingModifier } from "./CraftingModifier";
import type { AffixSlot, CraftContext } from "../domain/CraftContext";
import type { CraftedItem } from "../domain/CraftedItem";
import type { ModEntry } from "../types";
import { Essence } from "../ingredients/Essence";

abstract class OmenModifier implements CraftingModifier {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly costKey: string;
  abstract readonly ingredientIds: readonly string[];

  canApplyTo(ingredient: CraftingIngredient): boolean {
    return this.ingredientIds.includes(ingredient.id) ||
      (this.ingredientIds.includes("essence") && ingredient instanceof Essence);
  }

  cost(): CurrencyBasket {
    return { [this.costKey]: 1 };
  }
}

function randomFrom<T>(items: T[], ctx: CraftContext): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(ctx.rng() * items.length)];
}

export class OmenOfWhittling extends OmenModifier {
  readonly id = "omen_whittling";
  readonly displayName = "Omen of Whittling";
  readonly costKey = "omen_whittling";
  readonly ingredientIds = ["chaos"];

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[]): ModEntry | null {
    return candidates.reduce((min, m) => m.required_level < min.required_level ? m : min);
  }
}

export class OmenOfSinistralErasure extends OmenModifier {
  readonly id = "omen_sinistral_erasure";
  readonly displayName = "Omen of Sinistral Erasure";
  readonly costKey = "omen_sinistral_erasure";
  readonly ingredientIds = ["chaos"];

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null {
    return randomFrom(candidates.filter(m => m.gen_type === "prefix"), ctx);
  }
}

export class OmenOfDextralErasure extends OmenModifier {
  readonly id = "omen_dextral_erasure";
  readonly displayName = "Omen of Dextral Erasure";
  readonly costKey = "omen_dextral_erasure";
  readonly ingredientIds = ["chaos"];

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null {
    return randomFrom(candidates.filter(m => m.gen_type === "suffix"), ctx);
  }
}

export class OmenOfSinistralExaltation extends OmenModifier {
  readonly id = "omen_sinistral";
  readonly displayName = "Omen of Sinistral Exaltation";
  readonly costKey = "omen_sinistral";
  readonly ingredientIds = ["alch", "regal", "exalt", "greater_exalt", "perfect_exalt"];

  selectAddSlot(_item: CraftedItem, availableSlots: AffixSlot[]): AffixSlot | null {
    return availableSlots.includes("prefix") ? "prefix" : null;
  }
}

export class OmenOfDextralExaltation extends OmenModifier {
  readonly id = "omen_dextral";
  readonly displayName = "Omen of Dextral Exaltation";
  readonly costKey = "omen_dextral";
  readonly ingredientIds = ["alch", "regal", "exalt", "greater_exalt", "perfect_exalt"];

  selectAddSlot(_item: CraftedItem, availableSlots: AffixSlot[]): AffixSlot | null {
    return availableSlots.includes("suffix") ? "suffix" : null;
  }
}

export class OmenOfGreaterExaltation extends OmenModifier {
  readonly id = "omen_greater";
  readonly displayName = "Omen of Greater Exaltation";
  readonly costKey = "omen_greater";
  readonly ingredientIds = ["exalt", "greater_exalt", "perfect_exalt", "annul"];

  modifyAddCount(ingredientId: string, baseCount: number): number {
    return ["exalt", "greater_exalt", "perfect_exalt"].includes(ingredientId) ? baseCount + 1 : baseCount;
  }

  modifyRemoveCount(ingredientId: string, baseCount: number): number {
    return ingredientId === "annul" ? baseCount + 1 : baseCount;
  }
}

export class OmenOfSinistralAnnulment extends OmenModifier {
  readonly id = "omen_sinistral_annulment";
  readonly displayName = "Omen of Sinistral Annulment";
  readonly costKey = "omen_sinistral_annulment";
  readonly ingredientIds = ["annul"];

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null {
    return randomFrom(candidates.filter(m => m.gen_type === "prefix"), ctx);
  }
}

export class OmenOfDextralAnnulment extends OmenModifier {
  readonly id = "omen_dextral_annulment";
  readonly displayName = "Omen of Dextral Annulment";
  readonly costKey = "omen_dextral_annulment";
  readonly ingredientIds = ["annul"];

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null {
    return randomFrom(candidates.filter(m => m.gen_type === "suffix"), ctx);
  }
}

export class OmenOfSinistralCrystallisation extends OmenModifier {
  readonly id = "omen_sinistral_crystallisation";
  readonly displayName = "Omen of Sinistral Crystallisation";
  readonly costKey = "omen_sinistral_crystallisation";
  readonly ingredientIds = ["essence"];

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null {
    return randomFrom(candidates.filter(m => m.gen_type === "prefix"), ctx);
  }
}

export class OmenOfDextralCrystallisation extends OmenModifier {
  readonly id = "omen_dextral_crystallisation";
  readonly displayName = "Omen of Dextral Crystallisation";
  readonly costKey = "omen_dextral_crystallisation";
  readonly ingredientIds = ["essence"];

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null {
    return randomFrom(candidates.filter(m => m.gen_type === "suffix"), ctx);
  }
}
