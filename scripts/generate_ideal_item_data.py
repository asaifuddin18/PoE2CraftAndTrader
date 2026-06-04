#!/usr/bin/env python3
"""
Generate ideal-item-data.json for the Ideal Item Creator UI.

Outputs: web/public/ideal-item-data.json

Contains:
  classes:   list of { id, label, baseIds }      — item classes with their craftofexile base IDs
  baseItems: { baseId: [{name, dropLevel}] }      — specific base items per base
  mods:      { baseId: [{modId, name, affix, tags, modgroups, statId?, tiers}] }
  statIds:   { normalizedText: statId }           — GGG stat IDs from trade API (for linking)
"""

import json, re, sys
from pathlib import Path
from collections import defaultdict

ROOT     = Path(__file__).parent.parent
COE_RAW  = ROOT / "data" / "raw" / "craftofexile" / "poec_data.json"
STATS    = ROOT / "data" / "raw" / "trade_stats.json"
OUTPUT   = ROOT / "web" / "public" / "ideal-item-data.json"

# ── Item class → craftofexile base ID mapping ─────────────────────────────────
# Maps our frontend item class IDs to craftofexile base IDs
CLASS_TO_BASES = {
    "accessory.ring":    ["1"],
    "accessory.amulet":  ["2"],
    "accessory.belt":    ["3"],
    "armour.quiver":     ["4"],
    "armour.shield.str": ["5"],
    "armour.shield.dex": ["6"],
    "armour.shield.strdex": ["8"],
    "armour.shield.strint": ["9"],
    "armour.buckler":    ["6"],  # DEX shields
    "armour.focus":      ["229"],
    "weapon.claw":       ["11"],
    "weapon.dagger":     ["12"],
    "weapon.onesword":   ["13"],
    "weapon.oneaxe":     ["15"],
    "weapon.onemace":    ["16"],
    "weapon.sceptre":    ["17"],
    "weapon.wand":       ["18", "218", "219", "220", "221", "222"],  # all wand types
    "weapon.bow":        ["20"],
    "weapon.staff":      ["21", "223", "224", "225", "226", "227"],  # all staff types
    "weapon.twosword":   ["22"],
    "weapon.twomace":    ["23"],
    "weapon.twoaxe":     ["24"],
    "weapon.warstaff":   ["25"],
    "weapon.crossbow":   ["228"],
    "weapon.spear":      ["216"],
    "weapon.flail":      ["217"],
    "weapon.talisman":   ["244"],
    "armour.helmet.str": ["52"],
    "armour.helmet.dex": ["53"],
    "armour.helmet.int": ["54"],
    "armour.helmet.strdex": ["55"],
    "armour.helmet.strint": ["56"],
    "armour.helmet.dexint": ["57"],
    "armour.gloves.str": ["33"],
    "armour.gloves.dex": ["34"],
    "armour.gloves.int": ["35"],
    "armour.gloves.strdex": ["36"],
    "armour.gloves.strint": ["37"],
    "armour.gloves.dexint": ["38"],
    "armour.boots.str":  ["39"],
    "armour.boots.dex":  ["40"],
    "armour.boots.int":  ["41"],
    "armour.boots.strdex": ["42"],
    "armour.boots.strint": ["43"],
    "armour.boots.dexint": ["44"],
    "armour.chest.str":  ["45"],
    "armour.chest.dex":  ["46"],
    "armour.chest.int":  ["47"],
    "armour.chest.strdex": ["48"],
    "armour.chest.strint": ["49"],
    "armour.chest.dexint": ["50"],
    "armour.chest.strdexint": ["246"],  # Grasping Mail
}

CLASS_LABELS = {
    "accessory.ring":    "Ring",
    "accessory.amulet":  "Amulet",
    "accessory.belt":    "Belt",
    "armour.quiver":     "Quiver",
    "armour.shield.str": "Shield (STR)",
    "armour.shield.dex": "Shield (DEX)",
    "armour.shield.strdex": "Shield (STR/DEX)",
    "armour.shield.strint": "Shield (STR/INT)",
    "armour.buckler":    "Buckler",
    "armour.focus":      "Focus",
    "weapon.claw":       "Claw",
    "weapon.dagger":     "Dagger",
    "weapon.onesword":   "One-Handed Sword",
    "weapon.oneaxe":     "One-Handed Axe",
    "weapon.onemace":    "One-Handed Mace",
    "weapon.sceptre":    "Sceptre",
    "weapon.wand":       "Wand",
    "weapon.bow":        "Bow",
    "weapon.staff":      "Staff",
    "weapon.twosword":   "Two-Handed Sword",
    "weapon.twomace":    "Two-Handed Mace",
    "weapon.twoaxe":     "Two-Handed Axe",
    "weapon.warstaff":   "Quarterstaff",
    "weapon.crossbow":   "Crossbow",
    "weapon.spear":      "Spear",
    "weapon.flail":      "Flail",
    "weapon.talisman":   "Talisman",
    "armour.helmet.str": "Helmet (STR)",
    "armour.helmet.dex": "Helmet (DEX)",
    "armour.helmet.int": "Helmet (INT)",
    "armour.helmet.strdex": "Helmet (STR/DEX)",
    "armour.helmet.strint": "Helmet (STR/INT)",
    "armour.helmet.dexint": "Helmet (DEX/INT)",
    "armour.gloves.str": "Gloves (STR)",
    "armour.gloves.dex": "Gloves (DEX)",
    "armour.gloves.int": "Gloves (INT)",
    "armour.gloves.strdex": "Gloves (STR/DEX)",
    "armour.gloves.strint": "Gloves (STR/INT)",
    "armour.gloves.dexint": "Gloves (DEX/INT)",
    "armour.boots.str":  "Boots (STR)",
    "armour.boots.dex":  "Boots (DEX)",
    "armour.boots.int":  "Boots (INT)",
    "armour.boots.strdex": "Boots (STR/DEX)",
    "armour.boots.strint": "Boots (STR/INT)",
    "armour.boots.dexint": "Boots (DEX/INT)",
    "armour.chest.str":  "Body Armour (STR)",
    "armour.chest.dex":  "Body Armour (DEX)",
    "armour.chest.int":  "Body Armour (INT)",
    "armour.chest.strdex": "Body Armour (STR/DEX)",
    "armour.chest.strint": "Body Armour (STR/INT)",
    "armour.chest.dexint": "Body Armour (DEX/INT)",
    "armour.chest.strdexint": "Body Armour (STR/DEX/INT)",
}


def normalize(text: str) -> str:
    """Normalize mod text for matching between sources."""
    t = text.lower().strip()
    t = re.sub(r'\+', '', t)
    t = re.sub(r'#', 'x', t)
    t = re.sub(r'\s+', ' ', t)
    t = re.sub(r'[|].*?]', '', t)  # strip markup display part
    t = re.sub(r'\[|\]', '', t)    # strip brackets
    return t.strip()


def main():
    for p in [COE_RAW, STATS]:
        if not p.exists():
            print(f"ERROR: {p} not found", file=sys.stderr)
            sys.exit(1)

    print("Loading craftofexile data...", file=sys.stderr)
    with open(COE_RAW) as f:
        raw = f.read()[6:]
    coe = json.loads(raw)

    print("Loading trade stats...", file=sys.stderr)
    with open(STATS) as f:
        stats_raw = json.load(f)

    # Build GGG stat ID lookup: normalizedText → { id, text }
    stat_lookup: dict[str, dict] = {}
    for group in stats_raw["result"]:
        for entry in group["entries"]:
            key = normalize(entry["text"])
            stat_lookup[key] = {"id": entry["id"], "text": entry["text"]}

    # Base items per base_id
    base_items: dict[str, list] = defaultdict(list)
    for bitem in coe["bitems"]["seq"]:
        if bitem.get("is_legacy") == "1":
            continue
        base_items[bitem["id_base"]].append({
            "name":      bitem["name_bitem"],
            "dropLevel": int(bitem.get("drop_level") or 0),
        })

    # Sort each base's items by drop level then name
    for bid in base_items:
        base_items[bid].sort(key=lambda x: (x["dropLevel"], x["name"]))

    # Mods per base_id
    mods_by_base: dict[str, list] = defaultdict(list)
    mods_raw = coe["modifiers"]["seq"]
    mods_by_id = {m["id_modifier"]: m for m in mods_raw}

    for base_id, mod_ids in coe["basemods"].items():
        # Only craftable gear
        base = next((b for b in coe["bases"]["seq"] if b["id_base"] == base_id), None)
        if not base:
            continue
        bgroup = next((bg for bg in coe["bgroups"]["seq"] if bg["id_bgroup"] == base["id_bgroup"]), None)
        if not bgroup or bgroup.get("is_craftable") != "1":
            continue

        for mod_id in mod_ids:
            mod = mods_by_id.get(mod_id)
            if not mod or mod["affix"] not in ("prefix", "suffix"):
                continue

            tier_list = coe["tiers"].get(mod_id, {}).get(base_id, [])
            if not tier_list:
                continue

            try:
                modgroups = json.loads(mod["modgroups"]) if mod.get("modgroups") else []
            except Exception:
                modgroups = []

            # Parse mtypes
            mtypes_str = mod.get("mtypes") or ""
            mtype_ids = [x for x in mtypes_str.strip("|").split("|") if x]
            mtype_names = []
            for mid in mtype_ids:
                mt = next((m for m in coe["mtypes"]["seq"] if m["id_mtype"] == mid), None)
                if mt:
                    mtype_names.append(mt["name_mtype"])

            # Sort tiers: best (highest ilvl) first
            tiers_sorted = sorted(tier_list, key=lambda t: -int(t["ilvl"]))
            tiers_out = []
            for i, tier in enumerate(tiers_sorted, 1):
                try:
                    values = json.loads(tier["nvalues"]) if tier.get("nvalues") else []
                except Exception:
                    values = []
                tiers_out.append({
                    "tier":   i,
                    "ilvl":   int(tier["ilvl"]),
                    "weight": int(tier["weighting"]),
                    "values": values,
                })

            # Skip mods where all tiers have weight 0 (can't roll naturally)
            if all(t["weight"] == 0 for t in tiers_out):
                continue

            # Try to find matching GGG stat ID
            mod_name = mod["name_modifier"] or ""
            norm_name = normalize(mod_name)
            stat_match = stat_lookup.get(norm_name)

            mods_by_base[base_id].append({
                "modId":     mod_id,
                "name":      mod_name,
                "affix":     mod["affix"],
                "modgroups": modgroups,
                "tags":      mtype_names,
                "statId":    stat_match["id"] if stat_match else None,
                "tiers":     tiers_out,
            })

    # Build classes list
    classes = []
    all_base_ids = set()
    for class_id, label in CLASS_LABELS.items():
        base_ids = CLASS_TO_BASES.get(class_id, [])
        # Only include classes that have mod data
        valid_base_ids = [b for b in base_ids if b in mods_by_base or b in base_items]
        if not valid_base_ids:
            continue
        classes.append({"id": class_id, "label": label, "baseIds": valid_base_ids})
        all_base_ids.update(valid_base_ids)

    output = {
        "classes":   classes,
        "baseItems": {bid: items for bid, items in base_items.items() if bid in all_base_ids},
        "mods":      {bid: mods  for bid, mods  in mods_by_base.items() if bid in all_base_ids},
    }

    # Stats
    total_mods = sum(len(v) for v in output["mods"].values())
    matched = sum(1 for mods in output["mods"].values() for m in mods if m["statId"])
    print(f"Classes: {len(classes)}", file=sys.stderr)
    print(f"Base IDs with data: {len(all_base_ids)}", file=sys.stderr)
    print(f"Total mod entries: {total_mods}", file=sys.stderr)
    print(f"Mods with matched GGG stat ID: {matched}/{total_mods}", file=sys.stderr)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT, "w") as f:
        json.dump(output, f, separators=(",", ":"))

    size = OUTPUT.stat().st_size
    print(f"Written to {OUTPUT} ({size/1024:.0f}KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
