import { EQUIPMENT_TYPES, MODIFIERS } from "./catalog";

export function validateGameData(): string[] {
  const errors: string[] = [];
  const equipmentIds = new Set<string>();

  for (const equipment of EQUIPMENT_TYPES) {
    if (equipmentIds.has(equipment.id)) errors.push(`Duplicate equipment ID: ${equipment.id}`);
    equipmentIds.add(equipment.id);

    const modIds = new Set<string>();
    for (const entry of equipment.mods) {
      if (MODIFIERS[entry.modifier.id] !== entry.modifier) {
        errors.push(`${equipment.label}: unknown modifier ${entry.modifier.id}`);
      }
      if (modIds.has(entry.modifier.id)) errors.push(`${equipment.label}: duplicate modifier ${entry.modifier.id}`);
      modIds.add(entry.modifier.id);

      const tiers = new Set<number>();
      for (const tier of entry.tiers) {
        if (tiers.has(tier.tier)) errors.push(`${equipment.label}/${entry.modifier.id}: duplicate tier ${tier.tier}`);
        if (tier.requiredLevel < 0) errors.push(`${equipment.label}/${entry.modifier.id}: negative required level`);
        if (tier.weight <= 0) errors.push(`${equipment.label}/${entry.modifier.id}: non-positive weight`);
        tiers.add(tier.tier);
      }
    }
  }

  return errors;
}
