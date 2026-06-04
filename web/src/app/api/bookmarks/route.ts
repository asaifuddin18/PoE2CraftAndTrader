import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { userPK, bookmarkSK, dbQuery, dbPut, dbDelete } from "@/lib/db";

async function getSession() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await dbQuery(userPK(session.user!.email!), "BOOKMARK#");
  const bookmarks = items.map(item => ({
    listingId:    item.listingId,
    bookmarkedAt: item.bookmarkedAt,
    data:         item.data,
  }));

  return NextResponse.json({ bookmarks });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listingId, data } = await req.json();
  if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });

  const userId = session.user!.email!;
  await dbPut({
    PK:           userPK(userId),
    SK:           bookmarkSK(listingId),
    listingId,
    bookmarkedAt: new Date().toISOString(),
    data,
    // GSI for cross-user queries if needed later
    GSI1PK: "BOOKMARK",
    GSI1SK: `${userId}#${listingId}`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listingId } = await req.json();
  await dbDelete(userPK(session.user!.email!), bookmarkSK(listingId));

  return NextResponse.json({ ok: true });
}
