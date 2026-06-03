#!/usr/bin/env python3
"""
Parse RePoE2 mods.json into a clean, DynamoDB-ready structure.

Input:  data/raw/mods.json  (downloaded from repoe-fork.github.io/poe2/mods.json)
Output: data/parsed/mods_parsed.json

Schema of each output entry:
{
  "modId":          str,   # original RePoE2 key, e.g. "IncreasedLife9"
  "family":         str,   # mod type group, e.g. "IncreasedLife"
  "tier":           int,   # 1 = best (highest ilvl req), ascending from there
  "name":           str,   # affix name shown on item, e.g. "Athlete's"
  "generationType": str,   # "prefix" or "suffix"
  "requiredLevel":  int,   # minimum item level for this tier to roll
  "isEssenceOnly":  bool,  # true if only obtainable via essence
  "groups":         [str], # exclusivity groups (only 1 mod per group per item)
  "implicitTags":   [str], # tags this mod adds to the item when present
  "stats": [
    {
      "id":  str,   # stat ID, e.g. "base_maximum_life"
      "min": int,
      "max": int
    }
  ],
  "spawnWeights": {
    "<item_class_tag>": int  # e.g. {"ring": 1, "amulet": 1, "default": 0}
  },
  "text":       str   # human-readable display text
}
"""

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent.parent
INPUT  = ROOT / "data" / "raw"  / "mods.json"
OUTPUT = ROOT / "data" / "parsed" / "mods_parsed.json"

# Only these generation types go into the craftable item mod pool.
# "essence" entries are essence-only mods; include them with is_essence_only=True.
CRAFTABLE_GEN_TYPES = {"prefix", "suffix", "essence"}

# Only item-domain mods are relevant for gear crafting.
TARGET_DOMAIN = "item"


def load_raw(path: Path) -> dict:
    print(f"Loading {path} ...", file=sys.stderr)
    with open(path) as f:
        return json.load(f)


def parse(raw: dict) -> list[dict]:
    # --- Step 1: filter to item-domain craftable mods ---
    item_mods = {
        key: entry
        for key, entry in raw.items()
        if entry["domain"] == TARGET_DOMAIN
        and entry["generation_type"] in CRAFTABLE_GEN_TYPES
    }
    print(f"  Filtered to {len(item_mods)} item-domain craftable mods", file=sys.stderr)

    # --- Step 2: group by family (type field) ---
    families: dict[str, list[tuple[str, dict]]] = defaultdict(list)
    for key, entry in item_mods.items():
        families[entry["type"]].append((key, entry))

    # --- Step 3: within each family, filter then assign consecutive tiers ---
    # T1 = highest required_level (best rolls, hardest to hit)
    results: list[dict] = []
    for family, members in families.items():
        # Sort descending by required_level; stable tie-break by key name
        members_sorted = sorted(members, key=lambda x: (-x[1]["required_level"], x[0]))

        # Infer sibling prefix/suffix type for normalising essence entries
        sibling_gen_types = [
            e["generation_type"]
            for _, e in members
            if e["generation_type"] in ("prefix", "suffix")
        ]
        sibling_gen_type = sibling_gen_types[0] if sibling_gen_types else "prefix"

        # First pass: collect valid candidates
        valid: list[tuple[str, dict, str, bool, dict]] = []
        for key, entry in members_sorted:
            gen_type = entry["generation_type"]
            is_essence_only = gen_type == "essence" or entry.get("is_essence_only", False)
            if gen_type == "essence":
                gen_type = sibling_gen_type

            spawn_weights = {
                sw["tag"]: sw["weight"]
                for sw in entry["spawn_weights"]
            }

            # Skip entries that can't naturally roll on any item class
            has_any_spawn = any(
                w > 0 for tag, w in spawn_weights.items() if tag != "default"
            )
            if not has_any_spawn and not is_essence_only:
                continue

            valid.append((key, entry, gen_type, is_essence_only, spawn_weights))

        # Second pass: assign consecutive tier numbers after filtering
        for tier_index, (key, entry, gen_type, is_essence_only, spawn_weights) in enumerate(valid, start=1):
            results.append({
                "modId":          key,
                "family":         family,
                "tier":           tier_index,
                "name":           entry["name"],
                "generationType": gen_type,
                "requiredLevel":  entry["required_level"],
                "isEssenceOnly":  is_essence_only,
                "groups":         entry.get("groups", []),
                "implicitTags":   entry.get("implicit_tags", []),
                "stats":          entry.get("stats", []),
                "spawnWeights":   spawn_weights,
                "text":           entry.get("text", ""),
            })

    print(f"  Produced {len(results)} mod entries across {len(families)} families", file=sys.stderr)
    return results


def summarise(mods: list[dict]) -> None:
    families = defaultdict(list)
    for m in mods:
        families[m["family"]].append(m)

    prefix_families = sum(1 for ms in families.values() if ms[0]["generationType"] == "prefix")
    suffix_families = sum(1 for ms in families.values() if ms[0]["generationType"] == "suffix")
    max_tiers = max(len(ms) for ms in families.values())
    essence_only = sum(1 for m in mods if m["isEssenceOnly"])

    # Collect all item class tags that appear with non-zero weight
    all_tags: set[str] = set()
    for m in mods:
        all_tags.update(tag for tag, w in m["spawnWeights"].items() if w > 0)
    all_tags.discard("default")

    print("\n=== Parse Summary ===", file=sys.stderr)
    print(f"  Total mod entries:   {len(mods)}", file=sys.stderr)
    print(f"  Mod families:        {len(families)}", file=sys.stderr)
    print(f"    Prefix families:   {prefix_families}", file=sys.stderr)
    print(f"    Suffix families:   {suffix_families}", file=sys.stderr)
    print(f"  Max tiers in family: {max_tiers}", file=sys.stderr)
    print(f"  Essence-only mods:   {essence_only}", file=sys.stderr)
    print(f"  Item class tags:     {sorted(all_tags)}", file=sys.stderr)

    # Show the IncreasedLife family as a sanity check
    print("\n--- IncreasedLife family (sanity check) ---", file=sys.stderr)
    for m in sorted(families.get("IncreasedLife", []), key=lambda x: x["tier"]):
        stat = m["stats"][0] if m["stats"] else {}
        tags = [t for t, w in m["spawnWeights"].items() if w > 0 and t != "default"]
        print(
            f"  T{m['tier']} {m['name']!r:20s}  ilvl={m['requiredLevel']:3d}"
            f"  {stat.get('min')}-{stat.get('max')}  tags={tags}",
            file=sys.stderr,
        )


def main() -> None:
    if not INPUT.exists():
        print(f"ERROR: {INPUT} not found. Run:\n  curl -o {INPUT} https://repoe-fork.github.io/poe2/mods.json", file=sys.stderr)
        sys.exit(1)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    raw   = load_raw(INPUT)
    mods  = parse(raw)
    summarise(mods)

    with open(OUTPUT, "w") as f:
        json.dump(mods, f, indent=2)

    print(f"\nWrote {len(mods)} entries to {OUTPUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
