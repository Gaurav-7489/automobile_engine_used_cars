import { sessionSecret } from "../session";

/**
 * Encrypts provider tokens before they are stored (AES-256-GCM, a fresh nonce per value). The key comes from TOKEN_ENCRYPTION_KEY,
 * or from SESSION_SECRET when that is not set; with neither, nothing is stored and connecting an account fails closed.
 */
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");

async function key(): Promise<CryptoKey | null> {
  const secret = process.env.TOKEN_ENCRYPTION_KEY && process.env.TOKEN_ENCRYPTION_KEY.length >= 32 ? process.env.TOKEN_ENCRYPTION_KEY : sessionSecret();
  if (!secret) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vandlabs-token-box:${secret}`));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(plain: string): Promise<string | null> {
  const k = await key();
  if (!k) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode(plain)));
  return `v1.${b64(iv)}.${b64(cipher)}`;
}

export async function open(sealed: string | null | undefined): Promise<string | null> {
  const [version, iv, cipher] = (sealed ?? "").split(".");
  const k = await key();
  if (!k || version !== "v1" || !iv || !cipher) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(iv, "base64url") }, k, Buffer.from(cipher, "base64url"));
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
