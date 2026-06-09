import type { CraftContext } from "../domain/CraftContext";
import { mergeCurrency, type CurrencyBasket } from "../domain/CurrencyBasket";
import { craftResult, rejectedResult, type CraftResult } from "../domain/CraftResult";
import { CraftedItem } from "../domain/CraftedItem";
import { AlloyCatalog } from "../domain/AlloyCatalog";
import { CatalystCatalog } from "../domain/CatalystCatalog";
import { DesecrationBoneCatalog } from "../domain/DesecrationBoneCatalog";
import { EssenceCatalog } from "../domain/EssenceCatalog";
import type { CraftingIngredient } from "../ingredients";
import {
  AnnulmentOrb,
  AlchemyOrb,
  AugmentationOrb,
  ChaosOrb,
  ExaltedOrb,
  FracturingOrb,
  GreaterAugmentationOrb,
  GreaterChaosOrb,
  GreaterExaltedOrb,
  GreaterRegalOrb,
  GreaterTransmutationOrb,
  PerfectChaosOrb,
  PerfectExaltedOrb,
  PerfectAugmentationOrb,
  PerfectRegalOrb,
  PerfectTransmutationOrb,
  RegalOrb,
  RevealDesecratedModifier,
  TransmutationOrb,
} from "../ingredients";
import {
  OmenOfAbyssalEchoes,
  OmenOfDextralAlchemy,
  OmenOfCatalysingExaltation,
  OmenOfDextralAnnulment,
  OmenOfDextralCoronation,
  OmenOfDextralCrystallisation,
  OmenOfDextralErasure,
  OmenOfDextralExaltation,
  OmenOfDextralNecromancy,
  OmenOfGreaterAnnulment,
  OmenOfGreaterExaltation,
  OmenOfLight,
  OmenOfPutrefaction,
  OmenOfSinistralAlchemy,
  OmenOfSinistralAnnulment,
  OmenOfSinistralCoronation,
  OmenOfSinistralCrystallisation,
  OmenOfSinistralErasure,
  OmenOfSinistralExaltation,
  OmenOfSinistralNecromancy,
  OmenOfTheBlackblooded,
  OmenOfTheLiege,
  OmenOfTheSovereign,
  OmenOfWhittling,
  withModifiers,
} from "../modifiers";
import type { ItemState, ModEntry, TargetMod } from "../types";

export interface CraftActionContext {
  pool: import("../types").ModPool;
  target: import("../types").TargetSpec;
  prices: import("../types").PriceTable;
  baseId: string;
  ilvl: number;
}

export interface RefinementAction {
  readonly id: string;
  readonly name: string;
  apply(item: CraftedItem, ctx: CraftContext): CraftResult;
}

function ingredientAction(id: string, name: string, ingredient: CraftingIngredient): RefinementAction {
  return { id, name, apply: (item, ctx) => ingredient.apply(item, ctx) };
}

function openingAction(id: string, name: string, ingredients: readonly CraftingIngredient[]): RefinementAction {
  return {
    id,
    name,
    apply: (_item, ctx) => {
      let current = CraftedItem.emptyNormal();
      let cost: CurrencyBasket = { white_base: 1 };
      const events: CraftResult["events"] = [];
      for (const ingredient of ingredients) {
        const result = ingredient.apply(current, ctx);
        if (!result.applied) return rejectedResult(_item, `${name} opening failed`);
        current = result.item;
        cost = mergeCurrency(cost, result.cost);
        events.push(...result.events);
      }
      return craftResult(current, cost, events);
    },
  };
}

function catalystExaltAction(catalyst: CraftingIngredient): RefinementAction {
  const exalt = withModifiers(new ExaltedOrb(), new OmenOfCatalysingExaltation());
  return {
    id: `catalysing_exalt_${catalyst.id}`,
    name: `${catalyst.displayName} + Omen of Catalysing Exaltation`,
    apply: (item, ctx) => {
      let current = item;
      let cost: CurrencyBasket = {};
      const events: CraftResult["events"] = [];
      while ((current.catalyst?.amount ?? 0) < 20) {
        const quality = catalyst.apply(current, ctx);
        if (!quality.applied) return rejectedResult(item, `${catalyst.displayName} setup failed`);
        current = quality.item;
        cost = mergeCurrency(cost, quality.cost);
        events.push(...quality.events);
      }
      const result = exalt.apply(current, ctx);
      if (!result.applied) return rejectedResult(item, "Catalysing Exaltation failed");
      return craftResult(result.item, mergeCurrency(cost, result.cost), [...events, ...result.events]);
    },
  };
}

export function generateRefinementActions(state: ItemState, context: CraftActionContext): RefinementAction[] {
  const item = CraftedItem.fromState(state);
  const actions: RefinementAction[] = [];
  if (item.corrupted) {
    if (item.allMods().some(mod => mod.hidden && mod.desecrated)) addDesecrationRevealActions(actions);
    return actions;
  }

  const missing = missingTargets(item, context.target.required_mods);
  const missingPrefixes = missing.some(mod => mod.gen_type === "prefix");
  const missingSuffixes = missing.some(mod => mod.gen_type === "suffix");
  const removablePrefixes = item.prefixes.some(mod => !item.fracturedModIds.has(mod.modId));
  const removableSuffixes = item.suffixes.some(mod => !item.fracturedModIds.has(mod.modId));

  if (item.rarity === "rare" && (item.openPrefix() || item.openSuffix())) {
    addExaltActions(actions, item, missingPrefixes, missingSuffixes);
    addCatalystActions(actions, item, missing, context);
  }

  if (item.rarity === "rare" && item.nonFracturedMods().length > 0) {
    addChaosActions(actions, removablePrefixes, removableSuffixes);
    addAnnulmentActions(actions, item, removablePrefixes, removableSuffixes);
    addPerfectEssenceActions(actions, missing, context);
    addAlloyActions(actions, missing, context);
  }

  if (
    item.rarity === "rare" &&
    item.nMods() >= 4 &&
    item.fracturedModIds.size === 0 &&
    item.allMods().some(mod => targetSatisfiedBy(mod, context.target.required_mods))
  ) {
    actions.push(ingredientAction("fracturing_orb", "Fracturing Orb", new FracturingOrb()));
  }

  if (item.rarity === "rare") addDesecrationActions(actions, item, missingPrefixes, missingSuffixes, context);
  addOpeningActions(actions, missingPrefixes, missingSuffixes);
  addGreaterEssenceOpenings(actions, missing, context);
  return uniqueActions(actions);
}

function addOpeningActions(actions: RefinementAction[], missingPrefixes: boolean, missingSuffixes: boolean): void {
  actions.push(
    openingAction("opening_transmute_augment_regal", "Transmutation, Augmentation, and Regal opening", [
      new TransmutationOrb(), new AugmentationOrb(), new RegalOrb(),
    ]),
    openingAction("opening_greater_currency", "Greater Transmutation, Augmentation, and Regal opening", [
      new GreaterTransmutationOrb(), new GreaterAugmentationOrb(), new GreaterRegalOrb(),
    ]),
    openingAction("opening_perfect_currency", "Perfect Transmutation, Augmentation, and Regal opening", [
      new PerfectTransmutationOrb(), new PerfectAugmentationOrb(), new PerfectRegalOrb(),
    ]),
  );
  if (missingPrefixes) {
    actions.push(
      openingAction("opening_alchemy_prefix", "Alchemy with maximum prefixes", [
        withModifiers(new AlchemyOrb(), new OmenOfSinistralAlchemy()),
      ]),
      openingAction("opening_regal_prefix", "Transmutation, Augmentation, and prefix Regal opening", [
        new TransmutationOrb(), new AugmentationOrb(), withModifiers(new RegalOrb(), new OmenOfSinistralCoronation()),
      ]),
    );
  }
  if (missingSuffixes) {
    actions.push(
      openingAction("opening_alchemy_suffix", "Alchemy with maximum suffixes", [
        withModifiers(new AlchemyOrb(), new OmenOfDextralAlchemy()),
      ]),
      openingAction("opening_regal_suffix", "Transmutation, Augmentation, and suffix Regal opening", [
        new TransmutationOrb(), new AugmentationOrb(), withModifiers(new RegalOrb(), new OmenOfDextralCoronation()),
      ]),
    );
  }
}

function addExaltActions(actions: RefinementAction[], item: CraftedItem, missingPrefixes: boolean, missingSuffixes: boolean): void {
  const variants = [
    { id: "exalt", name: "Exalted Orb", ingredient: new ExaltedOrb() },
    { id: "greater_exalt", name: "Greater Exalted Orb", ingredient: new GreaterExaltedOrb() },
    { id: "perfect_exalt", name: "Perfect Exalted Orb", ingredient: new PerfectExaltedOrb() },
  ];
  for (const variant of variants) {
    actions.push(ingredientAction(variant.id, variant.name, variant.ingredient));
    if (item.nMods() <= 4) {
      actions.push(ingredientAction(
        `${variant.id}_greater_omen`,
        `${variant.name} + Omen of Greater Exaltation`,
        withModifiers(variant.ingredient, new OmenOfGreaterExaltation()),
      ));
    }
    if (item.openPrefix() && missingPrefixes) {
      actions.push(ingredientAction(
        `${variant.id}_prefix`,
        `${variant.name} + Omen of Sinistral Exaltation`,
        withModifiers(variant.ingredient, new OmenOfSinistralExaltation()),
      ));
    }
    if (item.openSuffix() && missingSuffixes) {
      actions.push(ingredientAction(
        `${variant.id}_suffix`,
        `${variant.name} + Omen of Dextral Exaltation`,
        withModifiers(variant.ingredient, new OmenOfDextralExaltation()),
      ));
    }
  }
}

function addChaosActions(actions: RefinementAction[], removablePrefixes: boolean, removableSuffixes: boolean): void {
  const variants = [
    { id: "chaos", name: "Chaos Orb", ingredient: new ChaosOrb() },
    { id: "greater_chaos", name: "Greater Chaos Orb", ingredient: new GreaterChaosOrb() },
    { id: "perfect_chaos", name: "Perfect Chaos Orb", ingredient: new PerfectChaosOrb() },
  ];
  for (const variant of variants) {
    actions.push(
      ingredientAction(variant.id, variant.name, variant.ingredient),
      ingredientAction(
        `${variant.id}_whittling`,
        `${variant.name} + Omen of Whittling`,
        withModifiers(variant.ingredient, new OmenOfWhittling()),
      ),
    );
    if (removablePrefixes) {
      actions.push(ingredientAction(
        `${variant.id}_remove_prefix`,
        `${variant.name} + Omen of Sinistral Erasure`,
        withModifiers(variant.ingredient, new OmenOfSinistralErasure()),
      ));
    }
    if (removableSuffixes) {
      actions.push(ingredientAction(
        `${variant.id}_remove_suffix`,
        `${variant.name} + Omen of Dextral Erasure`,
        withModifiers(variant.ingredient, new OmenOfDextralErasure()),
      ));
    }
  }
}

function addAnnulmentActions(
  actions: RefinementAction[],
  item: CraftedItem,
  removablePrefixes: boolean,
  removableSuffixes: boolean,
): void {
  actions.push(
    ingredientAction("annul", "Orb of Annulment", new AnnulmentOrb()),
    ingredientAction(
      "annul_greater",
      "Orb of Annulment + Omen of Greater Annulment",
      withModifiers(new AnnulmentOrb(), new OmenOfGreaterAnnulment()),
    ),
  );
  if (removablePrefixes) {
    actions.push(ingredientAction(
      "annul_prefix",
      "Orb of Annulment + Omen of Sinistral Annulment",
      withModifiers(new AnnulmentOrb(), new OmenOfSinistralAnnulment()),
    ));
  }
  if (removableSuffixes) {
    actions.push(ingredientAction(
      "annul_suffix",
      "Orb of Annulment + Omen of Dextral Annulment",
      withModifiers(new AnnulmentOrb(), new OmenOfDextralAnnulment()),
    ));
  }
  if (item.nonFracturedMods().some(mod => mod.desecrated)) {
    actions.push(ingredientAction(
      "annul_desecrated",
      "Orb of Annulment + Omen of Light",
      withModifiers(new AnnulmentOrb(), new OmenOfLight()),
    ));
  }
}

function addPerfectEssenceActions(actions: RefinementAction[], missing: TargetMod[], context: CraftActionContext): void {
  for (const definition of EssenceCatalog.definitions()) {
    if (definition.tier !== "perfect") continue;
    const guaranteed = definition.byBaseId[context.baseId] ?? [];
    if (!guaranteed.some(mod => missing.some(target => target.group === mod.group))) continue;
    const essence = EssenceCatalog.create(definition.id, context.baseId);
    if (!essence) continue;
    actions.push(
      ingredientAction(`essence_${definition.id}`, definition.name, essence),
      ingredientAction(
        `essence_${definition.id}_prefix_removal`,
        `${definition.name} + Omen of Sinistral Crystallisation`,
        withModifiers(essence, new OmenOfSinistralCrystallisation()),
      ),
      ingredientAction(
        `essence_${definition.id}_suffix_removal`,
        `${definition.name} + Omen of Dextral Crystallisation`,
        withModifiers(essence, new OmenOfDextralCrystallisation()),
      ),
    );
  }
}

function addGreaterEssenceOpenings(actions: RefinementAction[], missing: TargetMod[], context: CraftActionContext): void {
  for (const definition of EssenceCatalog.definitions()) {
    if (definition.tier !== "greater") continue;
    const guaranteed = definition.byBaseId[context.baseId] ?? [];
    if (!guaranteed.some(mod => missing.some(target => target.group === mod.group))) continue;
    const essence = EssenceCatalog.create(definition.id, context.baseId);
    if (!essence) continue;
    actions.push(openingAction(
      `opening_${definition.id}`,
      `Transmutation Orb + ${definition.name}`,
      [new TransmutationOrb(), essence],
    ));
  }
}

function addAlloyActions(actions: RefinementAction[], missing: TargetMod[], context: CraftActionContext): void {
  for (const definition of AlloyCatalog.definitions()) {
    const alloy = AlloyCatalog.create(definition.id, context.baseId, context.ilvl);
    if (!alloy || !missing.some(target => target.group === alloy.guaranteedMod.group)) continue;
    actions.push(ingredientAction(`alloy_${definition.id}`, definition.name, alloy));
  }
}

function addCatalystActions(
  actions: RefinementAction[],
  item: CraftedItem,
  missing: TargetMod[],
  context: CraftActionContext,
): void {
  const missingGroups = new Set(missing.map(target => target.group));
  const relevantMods = [...context.pool.prefixes, ...context.pool.suffixes]
    .filter(mod => missingGroups.has(mod.group));
  for (const definition of CatalystCatalog.definitions()) {
    if (!relevantMods.some(mod => mod.tags?.some(tag => definition.matchingTags.includes(tag)))) continue;
    const catalyst = CatalystCatalog.create(definition.id, context.baseId);
    if (!catalyst || (!item.openPrefix() && !item.openSuffix())) continue;
    actions.push(catalystExaltAction(catalyst));
  }
}

function addDesecrationActions(
  actions: RefinementAction[],
  item: CraftedItem,
  missingPrefixes: boolean,
  missingSuffixes: boolean,
  context: CraftActionContext,
): void {
  if (item.allMods().some(mod => mod.hidden && mod.desecrated)) {
    addDesecrationRevealActions(actions);
    return;
  }
  if (item.hasDesecratedModifier()) return;

  const missingGroups = new Set(missingTargets(item, context.target.required_mods).map(target => target.group));
  const desiredFamilies = new Set([...context.pool.prefixes, ...context.pool.suffixes]
    .filter(mod => missingGroups.has(mod.group))
    .map(mod => mod.abyssFamily)
    .filter((family): family is NonNullable<ModEntry["abyssFamily"]> => Boolean(family)));
  const tiers = context.ilvl < 65 ? ["gnawed", "preserved", "ancient"] as const : ["preserved", "ancient"] as const;
  const kinds = ["jawbone", "rib", "collarbone", "cranium"] as const;
  for (const tier of tiers) {
    for (const kind of kinds) {
      const bone = DesecrationBoneCatalog.create(tier, kind, context.baseId);
      if (!bone) continue;
      actions.push(ingredientAction(`desecrate_${tier}_${kind}`, bone.displayName, bone));
      if (kind === "jawbone" || kind === "collarbone") {
        const familyOmens = [
          new OmenOfTheSovereign(),
          new OmenOfTheLiege(),
          new OmenOfTheBlackblooded(),
        ].filter(omen => desiredFamilies.has(omen.family));
        for (const omen of familyOmens) {
          actions.push(ingredientAction(
            `desecrate_${tier}_${kind}_${omen.id}`,
            `${bone.displayName} + ${omen.displayName}`,
            withModifiers(bone, omen),
          ));
        }
      }
      if (missingPrefixes) {
        actions.push(ingredientAction(
          `desecrate_${tier}_${kind}_prefix`,
          `${bone.displayName} + Omen of Sinistral Necromancy`,
          withModifiers(bone, new OmenOfSinistralNecromancy()),
        ));
      }
      if (missingSuffixes) {
        actions.push(ingredientAction(
          `desecrate_${tier}_${kind}_suffix`,
          `${bone.displayName} + Omen of Dextral Necromancy`,
          withModifiers(bone, new OmenOfDextralNecromancy()),
        ));
      }
      actions.push(ingredientAction(
        `desecrate_${tier}_${kind}_putrefaction`,
        `${bone.displayName} + Omen of Putrefaction`,
        withModifiers(bone, new OmenOfPutrefaction()),
      ));
    }
  }
}

function addDesecrationRevealActions(actions: RefinementAction[]): void {
  actions.push(
    ingredientAction("desecration_reveal", "Reveal Desecrated Modifier", new RevealDesecratedModifier()),
    ingredientAction(
      "desecration_reveal_echoes",
      "Reveal Desecrated Modifier + Omen of Abyssal Echoes",
      withModifiers(new RevealDesecratedModifier(), new OmenOfAbyssalEchoes()),
    ),
  );
}

function missingTargets(item: CraftedItem, targets: TargetMod[]): TargetMod[] {
  return targets.filter(target => !item.allMods().some(mod => targetSatisfiedBy(mod, [target])));
}

function targetSatisfiedBy(mod: ModEntry, targets: TargetMod[]): boolean {
  return targets.some(target => mod.group === target.group && mod.tier <= target.min_tier);
}

function uniqueActions(actions: RefinementAction[]): RefinementAction[] {
  return [...new Map(actions.map(action => [action.id, action])).values()];
}

export function basketPrice(basket: CurrencyBasket, prices: Record<string, number>): number {
  return Object.entries(basket).reduce((sum, [currency, count]) => sum + count * (prices[currency] ?? 0), 0);
}
