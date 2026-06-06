import type { CraftingIngredient } from "../ingredients";
import type { CurrencyBasket } from "../domain/CurrencyBasket";
import type { OmenType } from "../types";
import type { CraftingModifier } from "./CraftingModifier";

abstract class OmenModifier implements CraftingModifier {
  abstract readonly id: string;
  abstract readonly displayName: string;
  abstract readonly costKey: string;
  abstract readonly omenType: Exclude<OmenType, null>;
  abstract readonly ingredientIds: readonly string[];

  canApplyTo(ingredient: CraftingIngredient): boolean {
    return this.ingredientIds.includes(ingredient.id);
  }

  cost(): CurrencyBasket {
    return { [this.costKey]: 1 };
  }

  toOmenType(): OmenType {
    return this.omenType;
  }
}

export class OmenOfWhittling extends OmenModifier {
  readonly id = "omen_whittling";
  readonly displayName = "Omen of Whittling";
  readonly costKey = "omen_whittling";
  readonly omenType = "whittling";
  readonly ingredientIds = ["chaos"];
}

export class OmenOfSinistralErasure extends OmenModifier {
  readonly id = "omen_sinistral_erasure";
  readonly displayName = "Omen of Sinistral Erasure";
  readonly costKey = "omen_sinistral_erasure";
  readonly omenType = "sinistral_erasure";
  readonly ingredientIds = ["chaos"];
}

export class OmenOfDextralErasure extends OmenModifier {
  readonly id = "omen_dextral_erasure";
  readonly displayName = "Omen of Dextral Erasure";
  readonly costKey = "omen_dextral_erasure";
  readonly omenType = "dextral_erasure";
  readonly ingredientIds = ["chaos"];
}

export class OmenOfSinistralExaltation extends OmenModifier {
  readonly id = "omen_sinistral";
  readonly displayName = "Omen of Sinistral Exaltation";
  readonly costKey = "omen_sinistral";
  readonly omenType = "sinistral";
  readonly ingredientIds = ["alch", "regal", "exalt"];
}

export class OmenOfDextralExaltation extends OmenModifier {
  readonly id = "omen_dextral";
  readonly displayName = "Omen of Dextral Exaltation";
  readonly costKey = "omen_dextral";
  readonly omenType = "dextral";
  readonly ingredientIds = ["alch", "regal", "exalt"];
}

export class OmenOfGreaterExaltation extends OmenModifier {
  readonly id = "omen_greater";
  readonly displayName = "Omen of Greater Exaltation";
  readonly costKey = "omen_greater";
  readonly omenType = "greater";
  readonly ingredientIds = ["exalt", "annul"];
}

export class OmenOfSinistralAnnulment extends OmenModifier {
  readonly id = "omen_sinistral_annulment";
  readonly displayName = "Omen of Sinistral Annulment";
  readonly costKey = "omen_sinistral_annulment";
  readonly omenType = "sinistral_annulment";
  readonly ingredientIds = ["annul"];
}

export class OmenOfDextralAnnulment extends OmenModifier {
  readonly id = "omen_dextral_annulment";
  readonly displayName = "Omen of Dextral Annulment";
  readonly costKey = "omen_dextral_annulment";
  readonly omenType = "dextral_annulment";
  readonly ingredientIds = ["annul"];
}

export class OmenOfSinistralCrystallisation extends OmenModifier {
  readonly id = "omen_sinistral_crystallisation";
  readonly displayName = "Omen of Sinistral Crystallisation";
  readonly costKey = "omen_sinistral_crystallisation";
  readonly omenType = "sinistral_crystallisation";
  readonly ingredientIds = ["essence"];
}

export class OmenOfDextralCrystallisation extends OmenModifier {
  readonly id = "omen_dextral_crystallisation";
  readonly displayName = "Omen of Dextral Crystallisation";
  readonly costKey = "omen_dextral_crystallisation";
  readonly omenType = "dextral_crystallisation";
  readonly ingredientIds = ["essence"];
}
