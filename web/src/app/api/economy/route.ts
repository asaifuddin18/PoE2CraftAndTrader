import { NextResponse } from "next/server";
import { dbQuery } from "@/lib/db";

/**
 * Economy prices are sourced entirely from DynamoDB (single source of truth),
 * written by the scheduled `price-sync` Lambda. This route no longer calls
 * poe2scout directly — it just reads CACHE#PRICE items and returns them.
 */

export interface CurrencyEntry {
  apiId:           string;
  name:            string;
  iconUrl:         string;
  exaltValue:      number;
  divineValue:     number;
  displayValue:    number;
  displayCurrency: "exalt" | "divine";
  category:        string;
}

export interface EconomyCategory {
  id:      string;
  label:   string;
  entries: CurrencyEntry[];
}

export interface EconomyData {
  league:        string;
  divineInExalt: number;
  updatedAt:     string;
  categories:    EconomyCategory[];
}

// Preserve the intended display ordering of categories.
const CAT_ORDER = [
  "currency", "abyss", "essences", "ritual", "breach",
  "delirium", "verisium", "ultimatum", "expedition", "incursion",
];

export async function GET() {
  try {
    const items = await dbQuery("CACHE#PRICE");
    const latest = items.find(i => i.SK === "LATEST");

    const categories: EconomyCategory[] = items
      .filter(i => typeof i.SK === "string" && (i.SK as string).startsWith("ECON#"))
      .map(i => ({ id: i.catId as string, label: i.label as string, entries: (i.entries ?? []) as CurrencyEntry[] }))
      .filter(c => c.entries.length > 0)
      .sort((a, b) => CAT_ORDER.indexOf(a.id) - CAT_ORDER.indexOf(b.id));

    if (!latest && categories.length === 0) {
      return NextResponse.json({ error: "Prices not synced yet — try again shortly." }, { status: 503 });
    }

    const data: EconomyData = {
      league:        (latest?.league as string) ?? "",
      divineInExalt: (latest?.divineInExalt as number) ?? 90,
      updatedAt:     (latest?.updatedAt as string) ?? new Date().toISOString(),
      categories,
    };
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
