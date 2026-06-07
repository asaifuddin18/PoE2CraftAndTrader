import type { CraftingIngredient } from "../ingredients";
import type { CurrencyBasket } from "../domain/CurrencyBasket";
import type { CraftingModifier } from "./CraftingModifier";
import type { AffixSlot, CraftContext } from "../domain/CraftContext";
import type { CraftedItem } from "../domain/CraftedItem";
import type { ModEntry } from "../types";
import { Essence } from "../ingredients/Essence";
import { CatalystCatalog } from "../domain/CatalystCatalog";
import type { ModPool } from "../types";

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
  readonly ingredientIds = ["chaos", "greater_chaos", "perfect_chaos"];

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[]): ModEntry | null {
    return candidates.reduce((min, m) => m.required_level < min.required_level ? m : min);
  }
}

export class OmenOfSinistralErasure extends OmenModifier {
  readonly id = "omen_sinistral_erasure";
  readonly displayName = "Omen of Sinistral Erasure";
  readonly costKey = "omen_sinistral_erasure";
  readonly ingredientIds = ["chaos", "greater_chaos", "perfect_chaos"];

  filterRemoveCandidates(_item: CraftedItem, candidates: ModEntry[]): ModEntry[] {
    return candidates.filter(m => m.gen_type === "prefix");
  }
}

export class OmenOfDextralErasure extends OmenModifier {
  readonly id = "omen_dextral_erasure";
  readonly displayName = "Omen of Dextral Erasure";
  readonly costKey = "omen_dextral_erasure";
  readonly ingredientIds = ["chaos", "greater_chaos", "perfect_chaos"];

  filterRemoveCandidates(_item: CraftedItem, candidates: ModEntry[]): ModEntry[] {
    return candidates.filter(m => m.gen_type === "suffix");
  }
}

export class OmenOfSinistralExaltation extends OmenModifier {
  readonly id = "omen_sinistral";
  readonly displayName = "Omen of Sinistral Exaltation";
  readonly costKey = "omen_sinistral";
  readonly ingredientIds = ["exalt", "greater_exalt", "perfect_exalt"];

  selectAddSlot(_item: CraftedItem, availableSlots: AffixSlot[]): AffixSlot | null {
    return availableSlots.includes("prefix") ? "prefix" : null;
  }
}

export class OmenOfDextralExaltation extends OmenModifier {
  readonly id = "omen_dextral";
  readonly displayName = "Omen of Dextral Exaltation";
  readonly costKey = "omen_dextral";
  readonly ingredientIds = ["exalt", "greater_exalt", "perfect_exalt"];

  selectAddSlot(_item: CraftedItem, availableSlots: AffixSlot[]): AffixSlot | null {
    return availableSlots.includes("suffix") ? "suffix" : null;
  }
}

export class OmenOfSinistralCoronation extends OmenModifier {
  readonly id = "omen_sinistral_coronation";
  readonly displayName = "Omen of Sinistral Coronation";
  readonly costKey = "omen_sinistral_coronation";
  readonly ingredientIds = ["regal", "greater_regal", "perfect_regal"];

  selectAddSlot(_item: CraftedItem, availableSlots: AffixSlot[]): AffixSlot | null {
    return availableSlots.includes("prefix") ? "prefix" : null;
  }
}

export class OmenOfDextralCoronation extends OmenModifier {
  readonly id = "omen_dextral_coronation";
  readonly displayName = "Omen of Dextral Coronation";
  readonly costKey = "omen_dextral_coronation";
  readonly ingredientIds = ["regal", "greater_regal", "perfect_regal"];

  selectAddSlot(_item: CraftedItem, availableSlots: AffixSlot[]): AffixSlot | null {
    return availableSlots.includes("suffix") ? "suffix" : null;
  }
}

export class OmenOfSinistralAlchemy extends OmenModifier {
  readonly id = "omen_sinistral_alchemy";
  readonly displayName = "Omen of Sinistral Alchemy";
  readonly costKey = "omen_sinistral_alchemy";
  readonly ingredientIds = ["alch"];
  readonly allowAddSlotFallback = true;

  selectAddSlot(_item: CraftedItem, availableSlots: AffixSlot[]): AffixSlot | null {
    return availableSlots.includes("prefix") ? "prefix" : null;
  }
}

export class OmenOfDextralAlchemy extends OmenModifier {
  readonly id = "omen_dextral_alchemy";
  readonly displayName = "Omen of Dextral Alchemy";
  readonly costKey = "omen_dextral_alchemy";
  readonly ingredientIds = ["alch"];
  readonly allowAddSlotFallback = true;

  selectAddSlot(_item: CraftedItem, availableSlots: AffixSlot[]): AffixSlot | null {
    return availableSlots.includes("suffix") ? "suffix" : null;
  }
}

export class OmenOfGreaterExaltation extends OmenModifier {
  readonly id = "omen_greater";
  readonly displayName = "Omen of Greater Exaltation";
  readonly costKey = "omen_greater";
  readonly ingredientIds = ["exalt", "greater_exalt", "perfect_exalt"];

  modifyAddCount(ingredientId: string, baseCount: number): number {
    return baseCount + 1;
  }
}

export class OmenOfCatalysingExaltation extends OmenModifier {
  readonly id = "omen_catalysing_exaltation";
  readonly displayName = "Omen of Catalysing Exaltation";
  readonly costKey = "omen_catalysing_exaltation";
  readonly ingredientIds = ["exalt", "greater_exalt", "perfect_exalt"];

  constructor(private readonly multipliers: Readonly<Record<number, number>> = { 20: 5, 40: 7.5 }) {
    super();
  }

  rejectionReason(item: CraftedItem): string | null {
    const quality = item.catalyst?.amount ?? 0;
    if (quality === 0) return `${this.displayName} requires Catalyst Quality`;
    if (!this.multipliers[quality]) {
      return `${this.displayName} has no verified weight multiplier for ${quality}% Catalyst Quality`;
    }
    return null;
  }

  transformAddPool(item: CraftedItem, pool: ModPool): ModPool | null {
    const catalyst = item.catalyst;
    if (!catalyst) return null;
    const multiplier = this.multipliers[catalyst.amount];
    if (!multiplier) return null;
    const matchingTags = new Set(CatalystCatalog.matchingTags(catalyst.type));
    const boost = (mods: ModEntry[]) => mods.map(mod => ({
      ...mod,
      weight: mod.tags?.some(tag => matchingTags.has(tag)) ? mod.weight * multiplier : mod.weight,
    }));
    return { prefixes: boost(pool.prefixes), suffixes: boost(pool.suffixes) };
  }

  afterSuccessfulApply(item: CraftedItem): CraftedItem {
    return item.consumeCatalystQuality();
  }
}

export class OmenOfGreaterAnnulment extends OmenModifier {
  readonly id = "omen_greater_annulment";
  readonly displayName = "Omen of Greater Annulment";
  readonly costKey = "omen_greater_annulment";
  readonly ingredientIds = ["annul"];

  modifyRemoveCount(ingredientId: string, baseCount: number): number {
    return baseCount + 1;
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

export class OmenOfLight extends OmenModifier {
  readonly id = "omen_light";
  readonly displayName = "Omen of Light";
  readonly costKey = "omen_light";
  readonly ingredientIds = ["annul"];

  filterRemoveCandidates(_item: CraftedItem, candidates: ModEntry[]): ModEntry[] {
    return candidates.filter(mod => mod.desecrated);
  }
}

export class OmenOfSinistralCrystallisation extends OmenModifier {
  readonly id = "omen_sinistral_crystallisation";
  readonly displayName = "Omen of Sinistral Crystallisation";
  readonly costKey = "omen_sinistral_crystallisation";
  readonly ingredientIds = ["essence"];

  canApplyTo(ingredient: CraftingIngredient): boolean {
    return ingredient instanceof Essence && ingredient.tier === "perfect";
  }

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null {
    return randomFrom(candidates.filter(m => m.gen_type === "prefix"), ctx);
  }
}

export class OmenOfDextralCrystallisation extends OmenModifier {
  readonly id = "omen_dextral_crystallisation";
  readonly displayName = "Omen of Dextral Crystallisation";
  readonly costKey = "omen_dextral_crystallisation";
  readonly ingredientIds = ["essence"];

  canApplyTo(ingredient: CraftingIngredient): boolean {
    return ingredient instanceof Essence && ingredient.tier === "perfect";
  }

  selectRemoveAffix(_item: CraftedItem, candidates: ModEntry[], ctx: CraftContext): ModEntry | null {
    return randomFrom(candidates.filter(m => m.gen_type === "suffix"), ctx);
  }
}
