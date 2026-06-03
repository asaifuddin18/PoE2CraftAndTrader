#!/usr/bin/env python3
"""
Extract clean mod data from craftofexile.com's poec_data.json.

This is the authoritative data source — craftofexile maintains manually curated
per-tier weights and value ranges for every craftable item type in PoE2.

Input:  data/raw/craftofexile/poec_data.json
Output: data/parsed/mods_coe.json

Output schema — flat list, one entry per (mod × base item type × tier):
{
  "modId":         str,        # craftofexile internal id e.g. "5046"
  "name":          str,        # display name e.g. "Adds # to # Fire damage to Attacks"
  "affix":         str,        # "prefix" or "suffix"
  "modgroups":     [str],      # family names e.g. ["FireDamage"] — used by essence targeting
  "tags":          [str],      # decoded mtype names e.g. ["Damage","Elemental","Fire","Attack"]
  "tagIds":        [str],      # raw mtype IDs e.g. ["33","20","6","3"]
  "isHybrid":      bool,       # true if mod has two stats (e.g. local armour + life)
  "baseId":        str,        # craftofexile base id e.g. "1"
  "baseName":      str,        # e.g. "Ring"
  "baseGroup":     str,        # item category e.g. "Jewellery"
  "tier":          int,        # 1 = best (highest ilvl req), ascending
  "requiredLevel": int,        # min item level for this tier to roll
  "weight":        int,        # spawn weight per tier (0 = cannot roll naturally)
  "values":        [...],      # stat value ranges — each element is [min, max] or a scalar
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

CRAFTABLE_AFFIXES = {"prefix", "suffix"}


def parse_mtypes(mtypes_str: str | None, mtype_lookup: dict) -> tuple[list[str], list[str]]:
    """Parse pipe-delimited mtype IDs into (tag_names, tag_ids)."""
    if not mtypes_str:
        return [], []
    ids = [x for x in mtypes_str.strip("|").split("|") if x]
    names = [mtype_lookup.get(i, {}).get("name_mtype", i) for i in ids]
    return names, ids


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
    mods_by_id    = {m["id_modifier"]: m for m in data["modifiers"]["seq"]}
    bgroups_by_id = {bg["id_bgroup"]: bg for bg in data["bgroups"]["seq"]}
    bases_by_id   = {b["id_base"]: b for b in data["bases"]["seq"]}
    mtype_by_id   = {mt["id_mtype"]: mt for mt in data["mtypes"]["seq"]}

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

            tier_list = data["tiers"].get(mod_id, {}).get(base_id, [])
            if not tier_list:
                skipped_no_tiers += 1
                continue

            try:
                modgroups = json.loads(mod["modgroups"]) if mod.get("modgroups") else []
            except (json.JSONDecodeError, TypeError):
                modgroups = []

            tag_names, tag_ids = parse_mtypes(mod.get("mtypes"), mtype_by_id)

            sorted_tiers = sorted(tier_list, key=lambda t: -int(t["ilvl"]))

            for tier_index, tier in enumerate(sorted_tiers, start=1):
                try:
                    values = json.loads(tier["nvalues"]) if tier.get("nvalues") else []
                except (json.JSONDecodeError, TypeError):
                    values = []

                results.append({
                    "modId":         mod_id,
                    "name":          mod["name_modifier"],
                    "affix":         mod["affix"],
                    "modgroups":     modgroups,
                    "tags":          tag_names,
                    "tagIds":        tag_ids,
                    "isHybrid":      mod.get("hybrid") == "1",
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

    # Sanity check: ring fire damage mod — should have Damage, Elemental, Fire, Attack tags
    fire = next((r for r in results
                 if r["baseId"] == "1" and "Fire damage to Attacks" in r["name"] and r["tier"] == 1), None)
    if fire:
        print(f"\n--- Ring fire damage T1 (sanity check) ---", file=sys.stderr)
        print(f"  name:      {fire['name']}", file=sys.stderr)
        print(f"  modgroups: {fire['modgroups']}", file=sys.stderr)
        print(f"  tags:      {fire['tags']}", file=sys.stderr)
        print(f"  tagIds:    {fire['tagIds']}", file=sys.stderr)
        print(f"  isHybrid:  {fire['isHybrid']}", file=sys.stderr)
        print(f"  weight:    {fire['weight']}", file=sys.stderr)
        print(f"  values:    {fire['values']}", file=sys.stderr)

    # Summary
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
