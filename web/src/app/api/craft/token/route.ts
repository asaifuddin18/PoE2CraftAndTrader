/**
 * Mints a short-lived HS256 JWT for the authenticated user so the browser can
 * call the AWS craft API (API Gateway) directly. The Lambda authorizer verifies
 * the same signature using AUTH_SECRET, shared via Secrets Manager.
 *
 * NextAuth's own session cookie is an encrypted JWE (httpOnly) and can't be used
 * as a cross-origin bearer token, hence this dedicated short-TTL token.
 */
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";

const TTL_SECONDS = 120;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body   = b64url(JSON.stringify(payload));
  const sig    = createHmac("sha256", secret).update(`${header}.${body}`).digest();
  return `${header}.${body}.${b64url(sig)}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET not configured" }, { status: 500 });
  }

  const now = Math.floor(Date.now() / 1000);
  const token = signJwt({ sub: session.user.email, iat: now, exp: now + TTL_SECONDS }, secret);
  return NextResponse.json({ token, expiresIn: TTL_SECONDS });
}
