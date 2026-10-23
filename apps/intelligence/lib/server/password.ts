import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, KEY_LENGTH, { N: n, r, p, maxmem: 128 * n * r * 2 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/** Format: scrypt$N$r$p$salt$hash (base64url). Parameters travel with the hash so they can be raised later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** A verification against a fixed hash so unknown accounts cost the same time as known ones. */
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword("not-a-real-password-for-timing");
  await verifyPassword(password, await dummy);
}

const COMMON = new Set(["password1234", "123456789012", "qwertyuiop12", "letmein12345", "administrator", "welcome12345", "changeme1234", "iloveyou1234"]);

/** Returns a user-facing reason, or null when the password is acceptable. */
export function passwordProblem(password: string, email = ""): string | null {
  if (password.length < 12) return "Use at least 12 characters.";
  if (password.length > 200) return "Use 200 characters or fewer.";
  if (COMMON.has(password.toLowerCase())) return "That password is too common. Choose a longer, less predictable one.";
  if (/^(.)\1+$/.test(password)) return "Do not repeat a single character.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "Do not include your email name in the password.";
  return null;
}

export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
