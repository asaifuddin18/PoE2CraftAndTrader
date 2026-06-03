#!/usr/bin/env python3
"""
Extract clean mod data from craftofexile.com's poec_data.json.

This is the authoritative data source — craftofexile maintains manually curated
per-tier weights and value ranges for every craftable item type in PoE2.

Input:  data/raw/craftofexile/poec_data.json
Output: data/parsed/mods_coe.json

Output schema — flat list, one entry per (mod × base item type × tier):
{
  "modId":       str,   # craftofexile internal id e.g. "5042"
  "name":        str,   # human-readable name e.g. "+# to maximum Life"
  "affix":       str,   # "prefix" or "suffix"
  "groups":      [str], # exclusivity groups (at most one mod per group per item)
  "baseId":      str,   # craftofexile base item id e.g. "1"
  "baseName":    str,   # human-readable e.g. "Ring"
  "baseGroup":   str,   # item category e.g. "Jewellery"
  "tier":        int,   # 1 = best (highest ilvl requirement), ascending
  "requiredLevel": int, # min item level for this tier to roll
  "weight":      int,   # spawn weight (0 = cannot roll naturally)
  "values":      [[float, float]], # stat value ranges [[min, max], ...] per stat
}
"""

import json
import sys
from pathlib import Path

ROOT   = Path(__file__).parent.parent
INPUT  = ROOT / "data" / "raw" / "craftofexile" / "poec_data.json"
OUTPUT = ROOT / "data" / "parsed" / "mods_coe.json"

# Only extract craftable gear — skip waystones, tablets, jewels, flasks, charms
CRAFTABLE_BGROUPS = {
    "1": "Jewellery",
    "2": "Body Armours",
    "3": "Boots",
    "5": "Gloves",
    "4": "Helmets",
    "6": "One-Handed Weapons",
    "7": "Two-Handed Weapons",
    "8": "Offhands",
}

# Only extract regular crafting mods
CRAFTABLE_AFFIXES = {"prefix", "suffix"}


def main() -> None:
    if not INPUT.exists():
        print(f"ERROR: {INPUT} not found.", file=sys.stderr)
        sys.exit(1)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    print("Loading craftofexile data...", file=sys.stderr)
    with open(INPUT) as f:
        raw = f.read()
    if raw.startswith("poecd="):
        raw = raw[6:]
    data = json.loads(raw)

    # Build lookups
    mods_by_id   = {m["id_modifier"]: m for m in data["modifiers"]["seq"]}
    bgroups_by_id = {bg["id_bgroup"]: bg for bg in data["bgroups"]["seq"]}
    bases_by_id  = {b["id_base"]: b for b in data["bases"]["seq"]}

    results: list[dict] = []
    skipped_no_tiers = 0
    skipped_non_craft = 0

    for base_id, mod_ids in data["basemods"].items():
        base = bases_by_id.get(base_id)
        if not base:
            continue
        bgroup = bgroups_by_id.get(base["id_bgroup"], {})
        if bgroup.get("id_bgroup") not in CRAFTABLE_BGROUPS:
            continue

        base_name  = base["name_base"]
        group_name = CRAFTABLE_BGROUPS[bgroup["id_bgroup"]]

        for mod_id in mod_ids:
            mod = mods_by_id.get(mod_id)
            if not mod:
                continue
            if mod["affix"] not in CRAFTABLE_AFFIXES:
                skipped_non_craft += 1
                continue

            # Get tier data for this mod on this base
            tier_list = data["tiers"].get(mod_id, {}).get(base_id, [])
            if not tier_list:
                skipped_no_tiers += 1
                continue

            # Parse exclusivity groups
            try:
                groups = json.loads(mod["modgroups"]) if mod.get("modgroups") else []
            except (json.JSONDecodeError, TypeError):
                groups = []

            # Sort tiers by ilvl descending (T1 = highest ilvl = best)
            sorted_tiers = sorted(tier_list, key=lambda t: -int(t["ilvl"]))

            for tier_index, tier in enumerate(sorted_tiers, start=1):
                try:
                    values = json.loads(tier["nvalues"])
                except (json.JSONDecodeError, TypeError):
                    values = []

                results.append({
                    "modId":         mod_id,
                    "name":          mod["name_modifier"],
                    "affix":         mod["affix"],
                    "groups":        groups,
                    "baseId":        base_id,
                    "baseName":      base_name,
                    "baseGroup":     group_name,
                    "tier":          tier_index,
                    "requiredLevel": int(tier["ilvl"]),
                    "weight":        int(tier["weighting"]),
                    "values":        values,
                })

    print(f"Extracted {len(results)} entries", file=sys.stderr)
    print(f"Skipped {skipped_non_craft} non-craftable affix entries", file=sys.stderr)
    print(f"Skipped {skipped_no_tiers} mods with no tier data for that base", file=sys.stderr)

    # Sanity check: ring max life
    ring_life = [r for r in results
                 if r["baseId"] == "1" and "+# to maximum Life" in r["name"]]
    print(f"\n--- Ring +# to maximum Life (sanity check) ---", file=sys.stderr)
    for r in ring_life:
        print(f"  T{r['tier']} ilvl={r['requiredLevel']:3d}  w={r['weight']}  values={r['values']}", file=sys.stderr)

    # Summary by base group
    from collections import Counter
    by_group = Counter(r["baseGroup"] for r in results)
    print(f"\n--- Entries by item group ---", file=sys.stderr)
    for group, count in sorted(by_group.items()):
        bases_in_group = len({r["baseId"] for r in results if r["baseGroup"] == group})
        print(f"  {group:25s} {count:5d} entries across {bases_in_group} bases", file=sys.stderr)

    with open(OUTPUT, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nWrote {len(results)} entries to {OUTPUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
