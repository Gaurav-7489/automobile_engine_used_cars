import { createHash } from "node:crypto";
import { signPayload, verifyPayload, signSession, SESSION_TTL_SECONDS } from "../session";
import { tenantTx } from "./db";
import { readEntitlements } from "./entitlement-store";
import { resolvePrincipal } from "./identity";
import { hitShared } from "../rate-limit";

/** The desktop application signs in through the system browser (authorization code with PKCE) and receives the same signed session the web uses. */
export const DESKTOP_REDIRECTS = ["http://localhost:43821/callback", "http://127.0.0.1:43821/callback"];
const CODE_TTL_SECONDS = 60;
const b64url = (buf: Buffer) => buf.toString("base64url");
export const challengeOf = (verifier: string) => b64url(createHash("sha256").update(verifier).digest());
const isChallenge = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v);

type CodePayload = { typ: "desktop-code"; sub: string; tid: string; ch: string; exp: number };

export async function desktopEnabled(tenantId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const e = await tenantTx(tenantId, (c) => readEntitlements(c, tenantId));
  return e.features.desktop.enabled ? { ok: true } : { ok: false, reason: e.features.desktop.reason };
}

export async function issueCode(userId: string, tenantId: string, challenge: unknown): Promise<string | null> {
  if (!isChallenge(challenge)) return null;
  return signPayload({ typ: "desktop-code", sub: userId, tid: tenantId, ch: challenge, exp: Math.floor(Date.now() / 1000) + CODE_TTL_SECONDS } satisfies CodePayload);
}

export type Redeemed = { ok: true; token: string; expiresIn: number } | { ok: false; status: 400 | 403; message: string };

/** Exchanges a code and its PKCE verifier for a session. A code works once, within a minute, and only for the verifier it was bound to. */
export async function redeemCode(code: unknown, verifier: unknown): Promise<Redeemed> {
  const bad = { ok: false as const, status: 400 as const, message: "Sign-in expired or was rejected. Sign in again." };
  if (typeof code !== "string" || typeof verifier !== "string" || verifier.length < 43 || verifier.length > 128) return bad;
  const payload = await verifyPayload<CodePayload>(code);
  if (!payload || payload.typ !== "desktop-code" || challengeOf(verifier) !== payload.ch) return bad;
  const once = await hitShared(`desktop-code:${createHash("sha256").update(code).digest("hex")}`, 1, 5 * 60_000);
  if (!once.allowed) return bad;
  const iat = Math.floor(Date.now() / 1000);
  const principal = await resolvePrincipal(payload.sub, payload.tid, iat);
  if (!principal) return { ok: false, status: 403, message: "This account cannot sign in to the desktop application." };
  const enabled = await desktopEnabled(payload.tid);
  if (!enabled.ok) return { ok: false, status: 403, message: enabled.reason };
  const token = await signSession({ sub: payload.sub, tid: payload.tid, name: "", email: "", role: "viewer", branchIds: [], iat, exp: iat + SESSION_TTL_SECONDS });
  return token ? { ok: true, token, expiresIn: SESSION_TTL_SECONDS } : { ok: false, status: 403, message: "Sign-in is not available right now." };
}
