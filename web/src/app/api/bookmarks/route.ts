import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

// In-memory store for dev. Replace with DynamoDB when infra is ready.
// Keyed by userId → listingId → bookmark object.
const store: Record<string, Record<string, object>> = {};

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user?.email ?? "anon";
  const bookmarks = Object.values(store[userId] ?? {});
  return NextResponse.json({ bookmarks });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user?.email ?? "anon";
  const body = await req.json();
  const { listingId, data } = body;

  if (!listingId) return NextResponse.json({ error: "listingId required" }, { status: 400 });

  if (!store[userId]) store[userId] = {};
  store[userId][listingId] = { ...data, bookmarkedAt: new Date().toISOString() };

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user?.email ?? "anon";
  const { listingId } = await req.json();

  if (store[userId]) delete store[userId][listingId];
  return NextResponse.json({ ok: true });
}
