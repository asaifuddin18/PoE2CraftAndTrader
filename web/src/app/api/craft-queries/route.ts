import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { craftQuerySK, dbDelete, dbPut, dbQuery, userPK } from "@/lib/db";

async function userId() {
  const session = await auth();
  return session?.user?.email ?? null;
}

export async function GET() {
  const user = await userId();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const craftQueries = (await dbQuery(userPK(user), "CRAFT_QUERY#"))
    .map(item => ({
      craftQueryId: item.craftQueryId,
      name: item.name,
      config: item.config,
      createdAt: item.createdAt,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return NextResponse.json({ craftQueries });
}

export async function POST(req: NextRequest) {
  const user = await userId();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, config } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!config?.baseId || !config?.preferences?.length) {
    return NextResponse.json({ error: "valid craft configuration required" }, { status: 400 });
  }

  const craftQueryId = randomUUID();
  const createdAt = new Date().toISOString();
  await dbPut({
    PK: userPK(user),
    SK: craftQuerySK(craftQueryId),
    craftQueryId,
    name: name.trim(),
    config,
    createdAt,
  });
  return NextResponse.json({ craftQueryId, createdAt });
}

export async function DELETE(req: NextRequest) {
  const user = await userId();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { craftQueryId } = await req.json();
  if (!craftQueryId) return NextResponse.json({ error: "craftQueryId required" }, { status: 400 });
  await dbDelete(userPK(user), craftQuerySK(craftQueryId));
  return NextResponse.json({ ok: true });
}
