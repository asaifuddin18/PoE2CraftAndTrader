import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbGet, dbPut, dbDelete, dbQuery, userPK } from "@/lib/db";

const noteSK = (listingId: string) => `NOTE#${listingId}`;

async function getSession() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session;
}

/** GET /api/notes — return all notes for the user */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await dbQuery(userPK(session.user!.email!), "NOTE#");
  const notes: Record<string, { note: string; updatedAt: string }> = {};
  for (const item of items) {
    notes[item.listingId] = { note: item.note, updatedAt: item.updatedAt };
  }
  return NextResponse.json({ notes });
}

/** PUT /api/notes — save or update a note */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listingId, note } = await req.json();
  if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });

  const userId = session.user!.email!;

  if (!note?.trim()) {
    // Empty note = delete it
    await dbDelete(userPK(userId), noteSK(listingId));
  } else {
    await dbPut({
      PK:        userPK(userId),
      SK:        noteSK(listingId),
      listingId,
      note:      note.trim(),
      updatedAt: new Date().toISOString(),
    });
  }

  return NextResponse.json({ ok: true });
}

/** DELETE /api/notes — remove a note */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { listingId } = await req.json();
  await dbDelete(userPK(session.user!.email!), noteSK(listingId));
  return NextResponse.json({ ok: true });
}
