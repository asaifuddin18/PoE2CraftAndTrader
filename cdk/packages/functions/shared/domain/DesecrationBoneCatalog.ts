import { DesecrationBone, type DesecrationBoneKind, type DesecrationBoneTier } from "../ingredients/Desecration";

const WEAPON_BASE_IDS = new Set(["4", "11", "12", "13", "15", "16", "17", "18", "20", "21", "22", "23", "24", "25", "216", "217", "218", "219", "220", "221", "222", "223", "224", "225", "226", "227", "228", "244"]);
const ARMOUR_BASE_IDS = new Set(["33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47", "48", "49", "50", "52", "53", "54", "55", "56", "57", "246"]);
const JEWELLERY_BASE_IDS = new Set(["1", "2", "3"]);
const JEWEL_BASE_IDS = new Set<string>();

export class DesecrationBoneCatalog {
  static create(tier: DesecrationBoneTier, kind: DesecrationBoneKind, baseId: string): DesecrationBone | null {
    if (!isApplicable(kind, baseId)) return null;
    return new DesecrationBone(kind, tier);
  }
}

function isApplicable(kind: DesecrationBoneKind, baseId: string): boolean {
  if (kind === "jawbone") return WEAPON_BASE_IDS.has(baseId);
  if (kind === "rib") return ARMOUR_BASE_IDS.has(baseId);
  if (kind === "collarbone") return JEWELLERY_BASE_IDS.has(baseId);
  return JEWEL_BASE_IDS.has(baseId);
}
