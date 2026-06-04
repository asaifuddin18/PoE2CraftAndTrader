import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbGet, dbPut, dbDelete, dbQuery, userPK, idealSK } from "@/lib/db";
import { randomUUID } from "crypto";

async function getSession() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await dbQuery(userPK(session.user!.email!), "IDEAL#");
  const idealItems = items
    .map(item => ({
      idealId:    item.idealId,
      name:       item.name,
      classId:    item.classId    ?? item.itemClass ?? "",
      baseId:     item.baseId     ?? "",
      itemBase:   item.itemBase   ?? "",
      ilvl:       item.ilvl,
      targetMods: item.targetMods ?? [],
      updatedAt:  item.updatedAt,
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return NextResponse.json({ idealItems });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const idealId = randomUUID();
  const userId  = session.user!.email!;

  await dbPut({
    PK:         userPK(userId),
    SK:         idealSK(idealId),
    idealId,
    name:       body.name.trim(),
    classId:    body.classId    ?? "",
    baseId:     body.baseId     ?? "",
    itemBase:   body.itemBase   ?? "",
    ilvl:       body.ilvl       ?? 84,
    targetMods: body.targetMods ?? [],
    updatedAt:  new Date().toISOString(),
  });

  return NextResponse.json({ idealId });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body     = await req.json();
  const { idealId } = body;
  if (!idealId) return NextResponse.json({ error: "idealId required" }, { status: 400 });

  const userId   = session.user!.email!;
  const existing = await dbGet(userPK(userId), idealSK(idealId));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await dbPut({
    ...existing,
    name:       body.name?.trim()  ?? existing.name,
    itemClass:  body.itemClass     ?? existing.itemClass,
    itemBase:   body.itemBase      ?? existing.itemBase,
    ilvl:       body.ilvl          ?? existing.ilvl,
    targetMods: body.targetMods    ?? existing.targetMods,
    updatedAt:  new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { idealId } = await req.json();
  if (!idealId) return NextResponse.json({ error: "idealId required" }, { status: 400 });

  await dbDelete(userPK(session.user!.email!), idealSK(idealId));
  return NextResponse.json({ ok: true });
}
