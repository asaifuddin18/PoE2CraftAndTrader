import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbGet, dbPut, dbDelete, dbQuery, userPK, querySK } from "@/lib/db";
import { randomUUID } from "crypto";

async function getSession() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const items = await dbQuery(userPK(session.user!.email!), "QUERY#");
  const queries = items
    .map(item => ({
      queryId:   item.queryId,
      name:      item.name,
      gggQuery:  item.gggQuery,
      createdAt: item.createdAt,
      lastRunAt: item.lastRunAt ?? null,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ queries });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, gggQuery } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!gggQuery)      return NextResponse.json({ error: "gggQuery required" }, { status: 400 });

  const queryId = randomUUID();
  const userId  = session.user!.email!;

  await dbPut({
    PK:        userPK(userId),
    SK:        querySK(queryId),
    queryId,
    name:      name.trim(),
    gggQuery,
    createdAt: new Date().toISOString(),
  });

  return NextResponse.json({ queryId });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { queryId } = await req.json();
  if (!queryId) return NextResponse.json({ error: "queryId required" }, { status: 400 });

  await dbDelete(userPK(session.user!.email!), querySK(queryId));
  return NextResponse.json({ ok: true });
}

// PATCH: update lastRunAt when a query is executed
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { queryId } = await req.json();
  const userId = session.user!.email!;
  const existing = await dbGet(userPK(userId), querySK(queryId));
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await dbPut({ ...existing, lastRunAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
