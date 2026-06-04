import { NextRequest, NextResponse } from "next/server";
import { tradeFetch } from "@/lib/trade-api";

export async function POST(req: NextRequest) {
  try {
    const { ids, queryId } = await req.json();
    const result = await tradeFetch(ids, queryId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
