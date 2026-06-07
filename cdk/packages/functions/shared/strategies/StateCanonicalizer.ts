import type { ItemState, ModEntry, TargetSpec } from "../types";

function modKey(mod: ModEntry, target: TargetSpec): string {
  const targetMod = target.required_mods.find(candidate => candidate.group === mod.group);
  const targetTier = targetMod && mod.tier <= targetMod.min_tier ? `target:${mod.tier}` : "other";
  return `${mod.gen_type}:${mod.group}:${targetTier}:${mod.required_level}:${mod.desecrated ? 1 : 0}`;
}

export function canonicalStateKey(state: ItemState, target: TargetSpec): string {
  const prefixes = state.prefixes.map(mod => modKey(mod, target)).sort().join(",");
  const suffixes = state.suffixes.map(mod => modKey(mod, target)).sort().join(",");
  return `${state.rarity}|p:${prefixes}|s:${suffixes}|f:${[...state.fractured_mod_ids].sort().join(",")}|c:${state.corrupted ? 1 : 0}`;
}
