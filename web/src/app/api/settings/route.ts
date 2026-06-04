import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { dbGet, dbPut, userPK } from "@/lib/db";

const PROFILE_SK = "PROFILE";

async function getSession() {
  const session = await auth();
  if (!session?.user?.email) return null;
  return session;
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const item = await dbGet(userPK(session.user!.email!), PROFILE_SK);

  // Return a masked POESESSID so the user can confirm which session is set
  // without exposing the full value (last 6 chars visible, rest masked)
  const rawSession: string | undefined = item?.poeSessionId;
  const maskedSession = rawSession
    ? "••••••••••••••••••••••••••" + rawSession.slice(-6)
    : null;

  return NextResponse.json({
    hasPoeSession:     !!rawSession,
    maskedPoeSession:  maskedSession,
    poeLeague:         item?.poeLeague ?? "Runes of Aldur",
    displayName:       session.user?.name,
    email:             session.user?.email,
    avatarUrl:         session.user?.image,
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const userId = session.user!.email!;

  const existing = await dbGet(userPK(userId), PROFILE_SK) ?? {};

  await dbPut({
    ...existing,
    PK:           userPK(userId),
    SK:           PROFILE_SK,
    email:        userId,
    displayName:  session.user?.name,
    avatarUrl:    session.user?.image,
    // Only update poeSessionId if explicitly provided
    ...(body.poeSessionId !== undefined ? { poeSessionId: body.poeSessionId } : {}),
    // Clear poeSessionId if asked
    ...(body.clearPoeSession ? { poeSessionId: null } : {}),
    poeLeague:    body.poeLeague ?? existing.poeLeague ?? "Runes of Aldur",
    updatedAt:    new Date().toISOString(),
  });

  return NextResponse.json({ ok: true });
}
