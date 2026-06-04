import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { tradeSearch, getUserTradeConfig } from "@/lib/trade-api";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const query = await req.json();
    const { poeSessionId, league } = await getUserTradeConfig(session.user.email);
    const result = await tradeSearch(query, poeSessionId, league);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
