export type AffixType = "prefix" | "suffix";

export interface BaseItemDefinition {
  name: string;
  dropLevel: number;
}

export interface ModifierTierDefinition {
  tier: number;
  requiredLevel: number;
  weight: number;
  values: unknown[];
}

export interface ModifierDefinitionInput {
  id: string;
  name: string;
  affix: AffixType;
  groups: readonly string[];
  tags: readonly string[];
  statId?: string;
}

export class ModifierDefinition {
  readonly id: string;
  readonly name: string;
  readonly affix: AffixType;
  readonly groups: readonly string[];
  readonly tags: readonly string[];
  readonly statId?: string;

  constructor(input: ModifierDefinitionInput) {
    this.id = input.id;
    this.name = input.name;
    this.affix = input.affix;
    this.groups = input.groups;
    this.tags = input.tags;
    this.statId = input.statId;
  }
}

export interface EquipmentModifierDefinition {
  modifier: ModifierDefinition;
  tiers: readonly ModifierTierDefinition[];
}

export function equipmentMod(
  modifier: ModifierDefinition,
  tiers: readonly ModifierTierDefinition[],
): EquipmentModifierDefinition {
  return { modifier, tiers };
}

export interface EquipmentTypeInput {
  id: string;
  label: string;
  itemClassIds: readonly string[];
  baseItems: readonly BaseItemDefinition[];
  mods: readonly EquipmentModifierDefinition[];
}

export abstract class EquipmentType {
  readonly id: string;
  readonly label: string;
  readonly itemClassIds: readonly string[];
  readonly baseItems: readonly BaseItemDefinition[];
  readonly mods: readonly EquipmentModifierDefinition[];

  protected constructor(input: EquipmentTypeInput) {
    this.id = input.id;
    this.label = input.label;
    this.itemClassIds = input.itemClassIds;
    this.baseItems = input.baseItems;
    this.mods = input.mods;
  }

  buildModPool(itemLevel: number) {
    return this.mods.flatMap(({ modifier, tiers }) =>
      tiers
        .filter(tier => tier.requiredLevel <= itemLevel && tier.weight > 0)
        .map(tier => ({
          modId: modifier.id,
          group: modifier.groups[0] ?? modifier.id,
          gen_type: modifier.affix,
          tier: tier.tier,
          required_level: tier.requiredLevel,
          weight: tier.weight,
          name: modifier.name,
        })),
    );
  }

  getTotalWeight(modifierId: string, itemLevel = Number.POSITIVE_INFINITY): number {
    const entry = this.mods.find(candidate => candidate.modifier.id === modifierId);
    return entry?.tiers
      .filter(tier => tier.requiredLevel <= itemLevel)
      .reduce((total, tier) => total + tier.weight, 0) ?? 0;
  }
}

export abstract class WeaponType extends EquipmentType {}
export abstract class ArmourType extends EquipmentType {}
export abstract class AccessoryType extends EquipmentType {}
