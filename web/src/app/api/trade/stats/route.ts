import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";

// Load stats once at module level
let statsCache: { id: string; text: string; type: string; group: string }[] | null = null;

function getStats() {
  if (statsCache) return statsCache;
  const filePath = join(process.cwd(), "../data/raw/trade_stats.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  statsCache = (raw.result as { id: string; label: string; entries: { id: string; text: string; type: string }[] }[])
    .flatMap(group =>
      group.entries.map(e => ({ ...e, group: group.label }))
    );
  return statsCache;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.toLowerCase() ?? "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20");

  const stats = getStats();
  const results = q
    ? stats.filter(s => s.text.toLowerCase().includes(q)).slice(0, limit)
    : stats.slice(0, limit);

  return NextResponse.json({ result: results });
}
