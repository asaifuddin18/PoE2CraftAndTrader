export interface TieredMod {
  modId: string;
  tiers: { tier: number; ilvl: number; weight: number }[];
}

export interface FilterPreference {
  modId: string;
}

export function eligibleTiers(mods: TieredMod[], modId: string, ilvl: number): number[] {
  return [
    ...new Set(
      mods
        .find(mod => mod.modId === modId)
        ?.tiers.filter(tier => tier.ilvl <= ilvl && tier.weight > 0)
        .map(tier => tier.tier) ?? [],
    ),
  ].sort((a, b) => a - b);
}

export function matchesJoint(
  tiers: number[],
  preferences: FilterPreference[],
  filters: Record<string, number>,
): boolean {
  return preferences.every((preference, index) => {
    const maximumTier = filters[preference.modId] ?? 0;
    return !maximumTier || Boolean(tiers[index] && tiers[index] <= maximumTier);
  });
}

export function formatCurrency(exalts: number, divinePrice: number): string {
  return exalts >= divinePrice
    ? `${(exalts / divinePrice).toFixed(2)} div`
    : `${exalts.toFixed(1)} ex`;
}
