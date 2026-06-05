/**
 * HTTP API Lambda authorizer (simple response, payload v2.0).
 * Verifies an HS256 Bearer JWT minted by the Next.js /api/craft/token route
 * using a shared secret held in Secrets Manager. No external JWT dependency.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const sm = new SecretsManagerClient({ region: process.env.AWS_REGION });
const SECRET_ARN = process.env.AUTH_SECRET_ARN ?? "";

let cachedSecret: string | null = null;
async function getSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const res = await sm.send(new GetSecretValueCommand({ SecretId: SECRET_ARN }));
  cachedSecret = res.SecretString ?? "";
  return cachedSecret;
}

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function verifyJwt(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, sigB64] = parts;

  const expected = createHmac("sha256", secret).update(`${headerB64}.${payloadB64}`).digest();
  const provided = b64urlToBuf(sigB64);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return false;

  try {
    const payload = JSON.parse(b64urlToBuf(payloadB64).toString("utf8"));
    if (payload.exp && Date.now() / 1000 > payload.exp) return false;
  } catch {
    return false;
  }
  return true;
}

interface AuthEvent {
  headers?: Record<string, string | undefined>;
  identitySource?: string[];
}

export async function handler(event: AuthEvent): Promise<{ isAuthorized: boolean }> {
  const raw =
    event.identitySource?.[0] ??
    event.headers?.authorization ??
    event.headers?.Authorization ??
    "";
  const token = raw.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { isAuthorized: false };

  try {
    const secret = await getSecret();
    return { isAuthorized: verifyJwt(token, secret) };
  } catch {
    return { isAuthorized: false };
  }
}
