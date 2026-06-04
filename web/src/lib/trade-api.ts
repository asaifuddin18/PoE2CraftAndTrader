const BASE_URL = "https://www.pathofexile.com/api/trade2";
const REALM = "poe2";

function gggHeaders(): Record<string, string> {
  const league = process.env.POE_LEAGUE ?? "Runes of Aldur";
  return {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    "Origin": "https://www.pathofexile.com",
    "Referer": `https://www.pathofexile.com/trade2/search/${REALM}/${encodeURIComponent(league)}`,
    "X-Requested-With": "XMLHttpRequest",
    "Cookie": `POESESSID=${process.env.POE_SESSION_ID}`,
  };
}

export interface SearchResult {
  id: string;        // query ID
  complexity: number;
  result: string[];  // listing IDs
}

export interface FetchResult {
  result: ListingRaw[];
}

export interface ListingRaw {
  id: string;
  listing: {
    indexed: string;
    price: { type: string; amount: number; currency: string };
    account: { name: string; lastCharacterName: string; online?: object };
    whisper: string;
    whisper_token: string;
  };
  item: {
    id: string;
    name: string;
    typeLine: string;
    baseType: string;
    rarity: string;
    ilvl: number;
    identified: boolean;
    corrupted?: boolean;
    icon: string;
    w: number;
    h: number;
    implicitMods?: string[];
    explicitMods?: string[];
    fracturedMods?: string[];
    enchantMods?: string[];
    extended?: {
      mods?: {
        explicit?: ModDetail[];
        implicit?: ModDetail[];
      };
    };
  };
}

export interface ModDetail {
  name: string;
  tier: string;   // e.g. "S7", "P3"
  level: number;
  magnitudes: { hash: string; min: string; max: string }[];
}

export async function tradeSearch(query: object): Promise<SearchResult> {
  const league = process.env.POE_LEAGUE ?? "Runes of Aldur";
  const url = `${BASE_URL}/search/${REALM}/${encodeURIComponent(league)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: gggHeaders(),
    body: JSON.stringify(query),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GGG search ${res.status}: ${body}`);
  }
  return res.json();
}

export async function tradeFetch(
  listingIds: string[],
  queryId: string
): Promise<FetchResult> {
  const ids = listingIds.slice(0, 10).join(",");
  const url = `${BASE_URL}/fetch/${ids}?query=${queryId}&realm=${REALM}`;

  const res = await fetch(url, { headers: gggHeaders() });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GGG fetch ${res.status}: ${body}`);
  }
  return res.json();
}

/** Strip [key|display] markup from mod text. */
export function parseMod(text: string): string {
  return text.replace(/\[([^\|\]]+)(?:\|([^\]]+))?\]/g, (_, key, display) =>
    display ?? key
  );
}
