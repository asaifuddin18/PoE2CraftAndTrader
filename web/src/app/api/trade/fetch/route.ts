import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { tradeFetch, getUserTradeConfig } from "@/lib/trade-api";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { ids, queryId } = await req.json();
    const { poeSessionId, cfClearance, league } = await getUserTradeConfig(session.user.email);
    const result = await tradeFetch(ids, queryId, poeSessionId, league, cfClearance);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
