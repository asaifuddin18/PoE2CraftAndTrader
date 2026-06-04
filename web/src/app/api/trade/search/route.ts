import { NextRequest, NextResponse } from "next/server";
import { tradeSearch } from "@/lib/trade-api";

export async function POST(req: NextRequest) {
  try {
    const query = await req.json();
    const result = await tradeSearch(query);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
