import type { RawMod } from "../functions/shared/types";
import { EQUIPMENT_TYPES } from "./generated/equipment-types";
import { ITEM_CLASSES } from "./generated/item-classes";
import { MODIFIERS } from "./generated/modifiers";

export { EQUIPMENT_TYPES, ITEM_CLASSES, MODIFIERS };

export function rawModsForEquipment(baseId: string): RawMod[] {
  const equipment = EQUIPMENT_TYPES.find(type => type.id === baseId);
  if (!equipment) return [];
  return equipment.mods.map(({ modifier, tiers }) => ({
    modId: modifier.id,
    name: modifier.name,
    affix: modifier.affix,
    modgroups: [...modifier.groups],
    tags: [...modifier.tags],
    statId: modifier.statId ?? null,
    tiers: tiers.map(tier => ({
      tier: tier.tier,
      ilvl: tier.requiredLevel,
      weight: tier.weight,
      values: [...tier.values],
    })),
  }));
}

export function buildIdealItemData() {
  return {
    classes: ITEM_CLASSES,
    baseItems: Object.fromEntries(EQUIPMENT_TYPES.map(type => [type.id, type.baseItems])),
    mods: Object.fromEntries(EQUIPMENT_TYPES.map(type => [type.id, rawModsForEquipment(type.id)])),
  };
}

export function buildDynamoModItems() {
  return EQUIPMENT_TYPES.flatMap(type =>
    rawModsForEquipment(type.id).map(mod => ({
      PK: `MODS#${type.id}`,
      SK: `MOD#${mod.modId}`,
      ...mod,
    })),
  );
}
