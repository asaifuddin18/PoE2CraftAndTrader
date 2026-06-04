#!/usr/bin/env python3
"""
PoE2 Trade API test script.

Usage:
  python3 scripts/trade_test.py --poesessid <YOUR_POESESSID>

Two endpoints:
  POST https://www.pathofexile.com/api/trade2/search/poe2/{league}
    Body: JSON query object
    Returns: { id: queryId, complexity: N, result: [listingId, ...] }

  GET https://www.pathofexile.com/api/trade2/fetch/{ids}?query={queryId}&realm=poe2
    ids: up to 10 comma-delimited listing IDs from the search result
    Returns: { result: [ ...full listing objects... ] }
"""

import argparse
import json
import time
import urllib.request
import urllib.parse
from pathlib import Path

BASE_URL = "https://www.pathofexile.com/api/trade2"
LEAGUE   = "Runes of Aldur"
REALM    = "poe2"

# Example query — rings with at least 80 max life, online sellers, sorted by price
EXAMPLE_QUERY = {
    "query": {
        "status": {
            "option": "online"
        },
        "filters": {
            "type_filters": {
                "filters": {
                    "category": {
                        "option": "accessory.ring"
                    }
                }
            }
        },
        "stats": [
            {
                "type": "and",
                "filters": [
                    {
                        "id": "explicit.stat_3299347043",  # +# to maximum Life
                        "value": {"min": 80},
                        "disabled": False
                    }
                ]
            }
        ]
    },
    "sort": {
        "price": "asc"
    }
}


def make_headers(poesessid: str) -> dict:
    return {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/json",
        "Origin": "https://www.pathofexile.com",
        "Referer": f"https://www.pathofexile.com/trade2/search/{REALM}/{urllib.parse.quote(LEAGUE)}",
        "X-Requested-With": "XMLHttpRequest",
        "Cookie": f"POESESSID={poesessid}",
    }


def search(query: dict, poesessid: str) -> dict:
    """POST /api/trade2/search/poe2/{league} — returns queryId + listing IDs."""
    league_encoded = urllib.parse.quote(LEAGUE)
    url = f"{BASE_URL}/search/{REALM}/{league_encoded}"
    body = json.dumps(query).encode()

    req = urllib.request.Request(url, data=body, headers=make_headers(poesessid), method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} error body: {e.read().decode()}")
        raise


def fetch(listing_ids: list[str], query_id: str, poesessid: str) -> dict:
    """GET /api/trade2/fetch/{ids}?query={queryId}&realm=poe2 — returns full listings."""
    ids_str = ",".join(listing_ids[:10])  # max 10 per request
    url = f"{BASE_URL}/fetch/{ids_str}?query={query_id}&realm={REALM}"

    req = urllib.request.Request(url, headers=make_headers(poesessid), method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def parse_item(listing: dict) -> dict:
    """Extract useful fields from a raw listing object."""
    item = listing.get("item", {})
    price_info = listing.get("listing", {}).get("price", {})

    return {
        "id":           item.get("id"),
        "name":         item.get("name", ""),
        "typeLine":     item.get("typeLine", ""),
        "ilvl":         item.get("ilvl"),
        "identified":   item.get("identified"),
        "corrupted":    item.get("corrupted", False),
        "implicitMods": item.get("implicitMods", []),
        "explicitMods": item.get("explicitMods", []),
        "fracturedMods":item.get("fracturedMods", []),
        "enchantMods":  item.get("enchantMods", []),
        "extendedMods": item.get("extended", {}).get("mods", {}),
        "price": {
            "amount":   price_info.get("amount"),
            "currency": price_info.get("currency"),
        },
        "seller":       listing.get("listing", {}).get("account", {}).get("name"),
        "listed":       listing.get("listing", {}).get("indexed"),
        "tradeId":      listing.get("id"),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--poesessid", required=True, help="Your GGG POESESSID cookie value")
    parser.add_argument("--save", action="store_true", help="Save results to data/raw/trade_results.json")
    args = parser.parse_args()

    print(f"Searching: rings with 80+ max life in '{LEAGUE}'...")
    search_resp = search(EXAMPLE_QUERY, args.poesessid)
    query_id    = search_resp["id"]
    all_ids     = search_resp["result"]
    print(f"  Query ID: {query_id}")
    print(f"  Total results: {len(all_ids)}")

    # Fetch first 10
    time.sleep(1)
    print(f"\nFetching first 10 listings...")
    fetch_resp = fetch(all_ids[:10], query_id, args.poesessid)
    listings   = fetch_resp["result"]
    print(f"  Got {len(listings)} listings")

    # Parse and display
    items = [parse_item(l) for l in listings]
    print()
    for item in items:
        price = f"{item['price']['amount']} {item['price']['currency']}"
        print(f"  [{price:15s}] {item['typeLine']:25s} ilvl={item['ilvl']}  seller={item['seller']}")
        for mod in item['explicitMods']:
            print(f"              {mod}")
        print()

    if args.save:
        out = Path("data/raw/trade_results.json")
        out.write_text(json.dumps({
            "queryId": query_id,
            "query":   EXAMPLE_QUERY,
            "items":   items,
            "raw":     listings,
        }, indent=2))
        print(f"Saved to {out}")


if __name__ == "__main__":
    main()
