import { EQUIPMENT_TYPES } from "../../../game-data/catalog";
import { Alloy } from "../ingredients/Alloy";
import type { ModEntry } from "../types";

type Affix = ModEntry["gen_type"];

interface AlloyVariant {
  labels: readonly string[];
  labelPrefixes?: readonly string[];
  affix: Affix;
  requiredLevel: number;
  name: string;
}

export interface AlloyDefinition {
  id: string;
  name: string;
  variants: readonly AlloyVariant[];
}

const MARTIAL_WEAPONS = [
  "One-Handed Sword", "One-Handed Axe", "One-Handed Mace", "Two-Handed Sword",
  "Two-Handed Axe", "Two-Handed Mace", "Spear", "Bow", "Quarterstaff", "Dagger",
  "Crossbow", "Flail", "Talisman",
] as const;
const CASTER_WEAPONS = ["Staff", "Wand", "Sceptre"] as const;
const WEAPONS = [...MARTIAL_WEAPONS, ...CASTER_WEAPONS] as const;
const ARMOUR_PREFIXES = ["Helmet", "Body Armour", "Gloves", "Boots", "Shield"] as const;

const variant = (
  labels: readonly string[],
  affix: Affix,
  requiredLevel: number,
  name: string,
  labelPrefixes?: readonly string[],
): AlloyVariant => ({ labels, labelPrefixes, affix, requiredLevel, name });

// Code-owned snapshot of the 0.5 Alloy table. Each variant is one deterministic
// modifier selected by the equipment type it is applied to.
const DEFINITIONS: readonly AlloyDefinition[] = [
  {
    id: "runic_alloy", name: "Runic Alloy", variants: [
      variant(["Ring"], "prefix", 10, "+(37-49) to maximum Runic Ward"),
      variant(["Amulet"], "prefix", 10, "(6-10)% increased maximum Runic Ward"),
      variant(["Belt"], "prefix", 10, "(15-20)% increased Runic Ward Regeneration Rate"),
    ],
  },
  {
    id: "adaptive_alloy", name: "Adaptive Alloy", variants: [
      variant(["Staff"], "prefix", 20, "Gain (42-52)% of Damage as Extra Fire Damage while missing Runic Ward"),
      variant(["Wand"], "prefix", 20, "Gain (21-26)% of Damage as Extra Fire Damage while missing Runic Ward"),
      variant(["Sceptre"], "prefix", 20, "(30-50)% Surpassing Chance to gain a Puppet Master stack when using Command Skills"),
      variant([], "suffix", 20, "(10-15)% increased Attack Speed while missing Runic Ward", ["Gloves"]),
    ],
  },
  {
    id: "protective_alloy", name: "Protective Alloy", variants: [
      variant(["Belt"], "prefix", 20, "Recover (32-45) Runic Ward when a Charm is used"),
      variant(WEAPONS, "suffix", 20, "+(51-74) to maximum Runic Ward"),
      variant([], "suffix", 10, "Recover (10-15) Runic Ward when you Block", ["Shield"]),
    ],
  },
  {
    id: "expansive_alloy", name: "Expansive Alloy", variants: [
      variant([], "suffix", 20, "Remnants can be collected from (35-50)% further away", ["Gloves"]),
      variant([], "suffix", 20, "(35-50)% increased Presence Area of Effect", ["Body Armour"]),
      variant([], "prefix", 20, "(18-29)% increased Mana Cost Efficiency", ["Helmet"]),
      variant([], "suffix", 20, "Temporary Minion Skills have +(1-2) to Limit of Minions summoned", ["Boots"]),
    ],
  },
  {
    id: "swift_alloy", name: "Swift Alloy", variants: [
      variant([], "suffix", 36, "(9-12)% increased Cast Speed", ["Gloves"]),
      variant(["Ring"], "suffix", 36, "(7-9)% increased Attack Speed"),
      variant(["Belt"], "suffix", 36, "Flasks gain (0.75-1) charges per Second"),
      variant(["Focus"], "suffix", 36, "(30-49)% increased Totem Placement speed", ["Shield"]),
    ],
  },
  {
    id: "cyclonic_alloy", name: "Cyclonic Alloy", variants: [
      variant([], "suffix", 36, "(15-30)% reduced Slowing Potency of Debuffs on You", ["Body Armour"]),
      variant([], "suffix", 36, "(15-19)% increased Skill Effect Duration", ["Boots"]),
      variant([], "suffix", 36, "(20-25)% increased Duration of Damaging Ailments on Enemies", ["Gloves"]),
      variant([], "suffix", 36, "(35-42)% increased Archon Buff duration", ["Helmet"]),
    ],
  },
  {
    id: "prismatic_alloy", name: "Prismatic Alloy", variants: [
      variant([], "prefix", 36, "Damage Penetrates (9-15)% Elemental Resistances", ["Gloves"]),
      variant(MARTIAL_WEAPONS, "suffix", 36, "(20-30)% increased Magnitude of Ailments you inflict"),
      variant(["Focus", "Staff", "Wand"], "suffix", 36, "(40-50)% increased Exposure Effect"),
      variant(["Sceptre"], "suffix", 36, "Minions have (40-49)% increased Magnitude of Damaging Ailments"),
    ],
  },
  {
    id: "mystic_alloy", name: "Mystic Alloy", variants: [
      variant([], "suffix", 36, "Spell Skills have (10-15)% increased Area of Effect", ["Helmet"]),
      variant([], "suffix", 36, "(10-15)% increased Area of Effect for Attacks", ["Gloves"]),
      variant([], "suffix", 36, "+(10-15) to Spirit", ["Boots"]),
      variant(["Quiver"], "suffix", 36, "(25-35)% chance to Chain an additional time"),
      variant(CASTER_WEAPONS, "suffix", 36, "+1 to maximum number of Elemental Infusions"),
    ],
  },
  {
    id: "sovereign_alloy", name: "Sovereign Alloy", variants: [
      variant(WEAPONS, "suffix", 52, "(20-30)% increased effect of Socketed Augment Items"),
      variant(["Focus"], "prefix", 20, "(24-30)% increased Runic Ward", ARMOUR_PREFIXES),
      variant(["Ring", "Amulet", "Belt"], "prefix", 52, "(20-30)% increased Explicit Resistance Modifier magnitudes"),
    ],
  },
  {
    id: "celestial_alloy", name: "Celestial Alloy", variants: [
      variant(["Staff", "Wand"], "prefix", 52, "+(142-188) to maximum Mana and +1 to Level of all Spell Skills"),
      variant(MARTIAL_WEAPONS, "prefix", 52, "+(327-427) to Accuracy Rating and (5-8)% increased Attack Speed"),
    ],
  },
  {
    id: "transcendent_alloy", name: "Transcendent Alloy", variants: [
      variant(["Focus", "Staff", "Wand"], "suffix", 52, "(39-47)% increased Cast Speed and Gain (11-16)% of Elemental Damage as Extra Cold Damage"),
      variant(MARTIAL_WEAPONS, "suffix", 52, "(15-20)% increased Physical Damage and +(7-10) to all Attributes"),
    ],
  },
  {
    id: "the_runebinders_alloy", name: "The Runebinder's Alloy", variants: [
      variant(["Staff"], "suffix", 52, "(25-50)% chance to gain Nature's Archon when your Plants Overgrow"),
      variant(["Wand"], "suffix", 52, "+1 to Limit for Elemental Skills"),
      variant(["Sceptre"], "suffix", 52, "+(4-5) maximum stacks of Puppet Master"),
      variant(["Crossbow"], "suffix", 52, "+2 to maximum number of Summoned Ballista Totems"),
      variant(["Bow"], "suffix", 52, "(40-50)% increased Effect of your Mark Skills"),
    ],
  },
  {
    id: "the_runefathers_alloy", name: "The Runefather's Alloy", variants: [
      variant(["One-Handed Mace", "Two-Handed Mace"], "suffix", 52, "(60-75)% chance for Skills to retain 40% of Glory on use"),
      variant(["Quarterstaff"], "suffix", 52, "Tempest Bells are destroyed after an additional (4-5) Hits"),
      variant(["Spear"], "suffix", 52, "+(8-10) to Weapon Range"),
      variant(["Talisman"], "suffix", 52, "Lightning Damage from Hits also Contributes to Flammability and Ignite Magnitudes"),
    ],
  },
];

export class AlloyCatalog {
  static create(alloyId: string, baseId: string, itemLevel: number): Alloy | null {
    const definition = DEFINITIONS.find(candidate => candidate.id === alloyId);
    const equipment = EQUIPMENT_TYPES.find(candidate => candidate.id === baseId);
    const alloyVariant = definition?.variants.find(candidate =>
      candidate.labels.includes(equipment?.label ?? "") ||
      candidate.labelPrefixes?.some(prefix => equipment?.label.startsWith(prefix)),
    );
    if (!definition || !alloyVariant || alloyVariant.requiredLevel > itemLevel) return null;

    return new Alloy(definition.id, definition.name, toModEntry(definition.id, equipment!.label, alloyVariant));
  }

  static isApplicable(alloyId: string, baseId: string, itemLevel: number): boolean {
    return this.create(alloyId, baseId, itemLevel) !== null;
  }

  static definitions(): readonly AlloyDefinition[] {
    return DEFINITIONS;
  }
}

function toModEntry(alloyId: string, equipmentLabel: string, alloyVariant: AlloyVariant): ModEntry {
  const equipmentId = slug(equipmentLabel);
  return {
    modId: `${alloyId}_${equipmentId}`,
    group: `${alloyId}_${equipmentId}`,
    gen_type: alloyVariant.affix,
    tier: 1,
    required_level: alloyVariant.requiredLevel,
    weight: 1,
    name: alloyVariant.name,
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
