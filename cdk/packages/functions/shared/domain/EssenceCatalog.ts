import catalog from "../data/essences.json";
import { Essence, type EssenceDefinition } from "../ingredients/Essence";

const definitions = catalog as Record<string, EssenceDefinition>;

export class EssenceCatalog {
  static create(essenceId: string, baseId: string): Essence | null {
    const definition = definitions[essenceId];
    const guaranteedMods = definition?.byBaseId[baseId];
    if (!definition || !guaranteedMods?.length) return null;
    return new Essence(definition.id, definition.name, definition.tier, guaranteedMods);
  }

  static isApplicable(essenceId: string, baseId: string): boolean {
    return this.create(essenceId, baseId) !== null;
  }

  static definitions(): readonly EssenceDefinition[] {
    return Object.values(definitions);
  }
}
