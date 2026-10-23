import type { Role, Session } from "./domain";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vl_session" : "vl_session";
export const REAUTH_COOKIE = process.env.NODE_ENV === "production" ? "__Host-vl_reauth" : "vl_reauth";
export const REAUTH_TTL_SECONDS = 10 * 60;
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Production fails closed without a configured secret; development uses a fixed local-only value. */
export function sessionSecret(): string | null {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") return null;
  return "development-only-session-secret-not-for-production";
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

export async function signPayload(payload: object): Promise<string | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  return `${body}.${b64url(await hmac(secret, body))}`;
}

export async function verifyPayload<T extends { exp: number }>(token: string | undefined | null): Promise<T | null> {
  if (!token) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    if (!constantTimeEqual(await hmac(secret, body), fromB64url(signature))) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body))) as T;
    return payload && typeof payload.exp === "number" && payload.exp * 1000 >= Date.now() ? payload : null;
  } catch {
    return null;
  }
}

export const signSession = (session: Session): Promise<string | null> => signPayload(session);

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

const ROLE_SET = new Set<Role>(["owner", "manager", "inventory", "marketing", "sales", "finance", "viewer"]);

export async function verifySession(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const secret = sessionSecret();
  if (!secret) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  try {
    const expected = await hmac(secret, body);
    if (!constantTimeEqual(expected, fromB64url(signature))) return null;
    const session = JSON.parse(new TextDecoder().decode(fromB64url(body))) as Session;
    if (!session || typeof session.sub !== "string" || typeof session.tid !== "string" || typeof session.iat !== "number" || !ROLE_SET.has(session.role) || !Array.isArray(session.branchIds) || typeof session.exp !== "number") return null;
    if (session.exp * 1000 < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

/** returnTo must stay inside the application. */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app/overview";
  if (!(value.startsWith("/app/") || value === "/app" || value.startsWith("/onboarding"))) return "/app/overview";
  return value;
}
