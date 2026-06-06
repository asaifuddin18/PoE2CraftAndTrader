import { Catalyst } from "../ingredients/Catalyst";
import type { CatalystType } from "../types";

export interface CatalystDefinition {
  id: string;
  name: string;
  type: CatalystType;
  matchingTags: readonly string[];
}

const DEFINITIONS: readonly CatalystDefinition[] = [
  { id: "flesh_catalyst", name: "Flesh Catalyst", type: "life", matchingTags: ["Life"] },
  { id: "neural_catalyst", name: "Neural Catalyst", type: "mana", matchingTags: ["Mana"] },
  { id: "carapace_catalyst", name: "Carapace Catalyst", type: "defences", matchingTags: ["Armor", "Evasion", "Energy Shield", "Defences"] },
  { id: "uul_netols_catalyst", name: "Uul-Netol's Catalyst", type: "physical", matchingTags: ["Physical"] },
  { id: "xophs_catalyst", name: "Xoph's Catalyst", type: "fire", matchingTags: ["Fire"] },
  { id: "tuls_catalyst", name: "Tul's Catalyst", type: "cold", matchingTags: ["Cold"] },
  { id: "eshs_catalyst", name: "Esh's Catalyst", type: "lightning", matchingTags: ["Lightning"] },
  { id: "chayulas_catalyst", name: "Chayula's Catalyst", type: "chaos", matchingTags: ["Chaos"] },
  { id: "reaver_catalyst", name: "Reaver Catalyst", type: "attack", matchingTags: ["Attack"] },
  { id: "sibilant_catalyst", name: "Sibilant Catalyst", type: "caster", matchingTags: ["Caster"] },
  { id: "skittering_catalyst", name: "Skittering Catalyst", type: "speed", matchingTags: ["Speed"] },
  { id: "adaptive_catalyst", name: "Adaptive Catalyst", type: "attribute", matchingTags: ["Attribute"] },
];
const JEWELLERY_BASE_IDS = new Set(["1", "2"]);

export class CatalystCatalog {
  static create(catalystId: string, baseId: string): Catalyst | null {
    const definition = DEFINITIONS.find(candidate => candidate.id === catalystId);
    if (!definition || !JEWELLERY_BASE_IDS.has(baseId)) return null;
    return new Catalyst(definition.id, definition.name, definition.type);
  }

  static matchingTags(type: CatalystType): readonly string[] {
    return DEFINITIONS.find(candidate => candidate.type === type)?.matchingTags ?? [];
  }

  static definitions(): readonly CatalystDefinition[] {
    return DEFINITIONS;
  }
}
