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

export function countMatchingJointOutcomes(
  encoded: string,
  preferences: FilterPreference[],
  filters: Record<string, number>,
): number {
  if (!encoded) return 0;
  return encoded.split(";").reduce((total, row) => {
    const [signature, count] = row.split("=");
    return total + (matchesJoint(signature, preferences, filters) ? parseInt(count, 36) : 0);
  }, 0);
}

export function matchesJoint(
  signature: string,
  preferences: FilterPreference[],
  filters: Record<string, number>,
): boolean {
  const tiers = new Map(
    signature
      .split(",")
      .filter(Boolean)
      .map(pair => pair.split(".").map(value => parseInt(value, 36)) as [number, number]),
  );
  return preferences.every((preference, preferenceIndex) => {
    const maximumTier = filters[preference.modId] ?? 0;
    const rolledTier = tiers.get(preferenceIndex);
    return !maximumTier || Boolean(rolledTier && rolledTier <= maximumTier);
  });
}

export function formatCurrency(exalts: number, divinePrice: number): string {
  return exalts >= divinePrice
    ? `${(exalts / divinePrice).toFixed(2)} div`
    : `${exalts.toFixed(1)} ex`;
}
