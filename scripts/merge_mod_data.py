#!/usr/bin/env python3
"""
Merge RePoE2 mod data (stat ranges, groups, stat IDs) with poe2db weight data
(per-tier per-item-type spawn weights) into a single DynamoDB-ready dataset.

Inputs:
  data/raw/mods.json           - RePoE2 datamined mod data
  data/raw/poe2db_weights.json - poe2db per-tier weights scraped per item type

Output:
  data/parsed/mods_merged.json

Schema per entry:
{
  "modId":          str,   # RePoE2 key e.g. "IncreasedLife9"
  "family":         str,   # mod type group e.g. "IncreasedLife"
  "tier":           int,   # 1 = best (highest ilvl req within family+itemType)
  "name":           str,   # affix name e.g. "Virile"
  "generationType": str,   # "prefix" or "suffix"
  "requiredLevel":  int,   # min item level for this tier to roll
  "isEssenceOnly":  bool,
  "groups":         [str], # exclusivity groups
  "implicitTags":   [str],
  "stats":          [{"id": str, "min": int, "max": int}],
  "itemType":       str,   # poe2db slug e.g. "Rings"
  "spawnWeight":    int,   # per-tier weight from poe2db (0 = cannot roll)
  "weightIsReal":   bool,  # False if poe2db had weight=1 fallback for this item type
  "text":           str,
}
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT           = Path(__file__).parent.parent
REPOE_INPUT    = ROOT / "data" / "raw" / "mods.json"
POE2DB_INPUT   = ROOT / "data" / "raw" / "poe2db_weights.json"
OUTPUT         = ROOT / "data" / "parsed" / "mods_merged.json"

CRAFTABLE_GEN_TYPES = {"prefix", "suffix", "essence"}
TARGET_DOMAIN = "item"

# Item types where ALL weights are weight=1 (poe2db has no real data)
# Identified from scrape: all entries had dropChance=1
FALLBACK_WEIGHT_SLUGS = {
    "Claws", "Daggers", "One_Hand_Swords", "One_Hand_Axes", "Flails",
    "Two_Hand_Swords", "Two_Hand_Axes", "Traps", "Body_Armours_str_dex_int",
}


def load_repoe(path: Path) -> dict:
    print(f"Loading RePoE2 data from {path}...", file=sys.stderr)
    with open(path) as f:
        raw = json.load(f)
    # Filter to item-domain craftable mods
    return {k: v for k, v in raw.items()
            if v["domain"] == TARGET_DOMAIN
            and v["generation_type"] in CRAFTABLE_GEN_TYPES}


def load_poe2db(path: Path) -> dict[str, list[dict]]:
    print(f"Loading poe2db weights from {path}...", file=sys.stderr)
    with open(path) as f:
        return json.load(f)


def build_poe2db_lookup(poe2db: dict) -> dict[str, dict[tuple, int]]:
    """
    Build a lookup: { slug -> { (family, name, level) -> dropChance } }
    """
    lookup = {}
    for slug, mods in poe2db.items():
        lookup[slug] = {}
        for m in mods:
            for fam in m["families"]:
                key = (fam, m["name"], m["level"])
                lookup[slug][key] = m["dropChance"]
    return lookup


def parse_and_merge(repoe: dict, poe2db_lookup: dict) -> list[dict]:
    # Group RePoE2 mods by family
    families: dict[str, list[tuple]] = defaultdict(list)
    for key, entry in repoe.items():
        families[entry["type"]].append((key, entry))

    all_item_type_slugs = list(poe2db_lookup.keys())

    results: list[dict] = []

    for family, members in families.items():
        # Determine sibling gen type for normalising essence entries
        sibling_gen = next(
            (e["generation_type"] for _, e in members
             if e["generation_type"] in ("prefix", "suffix")),
            "prefix"
        )

        # For each item type slug, find which members of this family can spawn there
        for slug in all_item_type_slugs:
            slug_lookup = poe2db_lookup[slug]
            weight_is_real = slug not in FALLBACK_WEIGHT_SLUGS

            # Find members that appear in this item type's poe2db data
            candidates = []
            for key, entry in members:
                gen_type = entry["generation_type"]
                is_essence = gen_type == "essence" or entry.get("is_essence_only", False)
                if gen_type == "essence":
                    gen_type = sibling_gen

                name = entry["name"]
                level = entry["required_level"]

                # Look up weight from poe2db
                weight = None
                for fam_name in [family] + entry.get("groups", []):
                    k = (fam_name, name, level)
                    if k in slug_lookup:
                        weight = slug_lookup[k]
                        break

                if weight is None:
                    continue  # This mod doesn't appear on this item type

                candidates.append((key, entry, gen_type, is_essence, weight))

            if not candidates:
                continue

            # Sort by level descending (T1 = highest ilvl = best), then key for stability
            candidates.sort(key=lambda x: (-x[1]["required_level"], x[0]))

            for tier_index, (key, entry, gen_type, is_essence, weight) in enumerate(candidates, start=1):
                spawn_weights_repoe = {
                    sw["tag"]: sw["weight"]
                    for sw in entry["spawn_weights"]
                }
                results.append({
                    "modId":          key,
                    "family":         family,
                    "tier":           tier_index,
                    "name":           entry["name"],
                    "generationType": gen_type,
                    "requiredLevel":  entry["required_level"],
                    "isEssenceOnly":  is_essence,
                    "groups":         entry.get("groups", []),
                    "implicitTags":   entry.get("implicit_tags", []),
                    "stats":          entry.get("stats", []),
                    "itemType":       slug,
                    "spawnWeight":    weight,
                    "weightIsReal":   weight_is_real and weight > 1,
                    "text":           entry.get("text", ""),
                })

    return results


def summarise(results: list[dict]) -> None:
    by_item = defaultdict(list)
    for r in results:
        by_item[r["itemType"]].append(r)

    print(f"\n=== Merge Summary ===", file=sys.stderr)
    print(f"Total entries:     {len(results)}", file=sys.stderr)
    print(f"Item types:        {len(by_item)}", file=sys.stderr)
    real = sum(1 for r in results if r["weightIsReal"])
    print(f"Real weights:      {real} ({100*real//len(results)}%)", file=sys.stderr)
    print(f"Fallback weights:  {len(results)-real}", file=sys.stderr)

    # Sanity check: Rings IncreasedLife
    ring_life = [r for r in results
                 if r["itemType"] == "Rings" and r["family"] == "IncreasedLife"]
    print(f"\n--- Rings IncreasedLife (sanity check) ---", file=sys.stderr)
    for r in ring_life:
        stat = r["stats"][0] if r["stats"] else {}
        print(f"  T{r['tier']} {r['name']!r:12s} ilvl={r['requiredLevel']:3d}"
              f"  {stat.get('min')}-{stat.get('max')}"
              f"  weight={r['spawnWeight']}  real={r['weightIsReal']}",
              file=sys.stderr)


def main() -> None:
    for p in [REPOE_INPUT, POE2DB_INPUT]:
        if not p.exists():
            print(f"ERROR: {p} not found.", file=sys.stderr)
            sys.exit(1)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    repoe      = load_repoe(REPOE_INPUT)
    poe2db     = load_poe2db(POE2DB_INPUT)
    lookup     = build_poe2db_lookup(poe2db)
    results    = parse_and_merge(repoe, lookup)

    summarise(results)

    with open(OUTPUT, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nWrote {len(results)} entries to {OUTPUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
