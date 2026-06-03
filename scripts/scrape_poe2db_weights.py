#!/usr/bin/env python3
"""
Scrape per-tier spawn weights from poe2db.tw for all craftable item types.

poe2db embeds mod data directly in page HTML as: new ModsView({...})
The DropChance field contains the actual per-tier spawn weight.

Output: data/raw/poe2db_weights.json
Schema: { "<slug>": [ { name, level, genType, families, dropChance }, ... ] }
"""

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT   = Path(__file__).parent.parent
OUTPUT = ROOT / "data" / "raw" / "poe2db_weights.json"

ITEM_TYPE_SLUGS = [
    # One-handed weapons
    "Claws", "Daggers", "Wands", "One_Hand_Swords", "One_Hand_Axes",
    "One_Hand_Maces", "Sceptres", "Spears", "Flails",
    # Two-handed weapons
    "Bows", "Staves", "Two_Hand_Swords", "Two_Hand_Axes", "Two_Hand_Maces",
    "Quarterstaves", "Crossbows", "Traps", "Talismans",
    # Jewellery
    "Amulets", "Rings", "Belts",
    # Gloves
    "Gloves_str", "Gloves_dex", "Gloves_int",
    "Gloves_str_dex", "Gloves_str_int", "Gloves_dex_int",
    # Boots
    "Boots_str", "Boots_dex", "Boots_int",
    "Boots_str_dex", "Boots_str_int", "Boots_dex_int",
    # Body Armours
    "Body_Armours_str", "Body_Armours_dex", "Body_Armours_int",
    "Body_Armours_str_dex", "Body_Armours_str_int", "Body_Armours_dex_int",
    "Body_Armours_str_dex_int",
    # Helmets
    "Helmets_str", "Helmets_dex", "Helmets_int",
    "Helmets_str_dex", "Helmets_str_int", "Helmets_dex_int",
    # Off-hand
    "Quivers", "Shields_str", "Shields_str_dex", "Shields_str_int",
    "Bucklers", "Foci",
]

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}

# Matches the ModsView JS object embedded in the page HTML
MODSVIEW_RE = re.compile(r'new ModsView\((\{.*?\})\s*\)', re.DOTALL)


def fetch_html(slug: str) -> str:
    url = f"https://poe2db.tw/us/{slug}"
    req = urllib.request.Request(url, headers=HEADERS)
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8")


def extract_normal_mods(html: str, slug: str) -> list[dict]:
    match = MODSVIEW_RE.search(html)
    if not match:
        print(f"  [WARN] No ModsView found for {slug}", file=sys.stderr)
        return []

    raw_js = match.group(1)

    # The data is JS (not strict JSON) — use a safe eval approach:
    # Replace JS-style constructs that aren't valid JSON if any exist.
    # In practice poe2db embeds valid JSON here, but strip trailing comma issues.
    try:
        data = json.loads(raw_js)
    except json.JSONDecodeError:
        # Fallback: strip HTML entities and retry
        raw_js = raw_js.replace("\\/", "/")
        try:
            data = json.loads(raw_js)
        except json.JSONDecodeError as e:
            print(f"  [ERROR] JSON parse failed for {slug}: {e}", file=sys.stderr)
            return []

    normal = data.get("normal", [])
    result = []
    for entry in (normal if isinstance(normal, list) else normal.values()):
        try:
            result.append({
                "name":       entry["Name"],
                "level":      int(entry["Level"]),
                "genType":    int(entry["ModGenerationTypeID"]),  # 1=prefix 2=suffix
                "families":   entry["ModFamilyList"],
                "dropChance": int(entry["DropChance"]),
            })
        except (KeyError, ValueError) as e:
            print(f"  [WARN] Skipping entry in {slug}: {e}", file=sys.stderr)
    return result


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    all_data: dict[str, list] = {}
    total_mods = 0

    for i, slug in enumerate(ITEM_TYPE_SLUGS, 1):
        print(f"[{i:2d}/{len(ITEM_TYPE_SLUGS)}] {slug} ...", end=" ", flush=True)
        try:
            html = fetch_html(slug)
            mods = extract_normal_mods(html, slug)
            all_data[slug] = mods
            total_mods += len(mods)
            print(f"{len(mods)} mods")
        except Exception as e:
            print(f"ERROR: {e}", file=sys.stderr)
            all_data[slug] = []
        # Polite delay between requests
        if i < len(ITEM_TYPE_SLUGS):
            time.sleep(0.5)

    with open(OUTPUT, "w") as f:
        json.dump(all_data, f, indent=2)

    print(f"\nWrote {total_mods} total mod entries across {len(all_data)} item types to {OUTPUT}")


if __name__ == "__main__":
    main()
