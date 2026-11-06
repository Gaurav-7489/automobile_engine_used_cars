/** One public address for support, feedback and "talk with us", used everywhere the product offers contact. */
export const SUPPORT_EMAIL = "hello@vandlabs.com";

export function supportMailto(subject: string, body = ""): string {
  const q = new URLSearchParams({ subject });
  if (body) q.set("body", body);
  return `mailto:${SUPPORT_EMAIL}?${q.toString().replace(/\+/g, "%20")}`;
}
