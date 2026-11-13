import { createHmac, timingSafeEqual } from "node:crypto";

/** Meta signs each webhook delivery with the app secret (X-Hub-Signature-256). */
export function validSignature(raw: string, header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice(7), "hex");
  const want = createHmac("sha256", secret).update(raw).digest();
  return given.length === want.length && timingSafeEqual(given, want);
}

type Incoming = { channel: "whatsapp" | "instagram"; account: string; from: string; name: string; text: string };

/** Text messages only; media, reactions, echoes of our own replies and status updates are ignored. */
export function parseDelivery(body: Record<string, unknown>): Incoming[] {
  const out: Incoming[] = [];
  const entries = Array.isArray(body.entry) ? (body.entry as Record<string, unknown>[]) : [];
  if (body.object === "whatsapp_business_account") {
    for (const entry of entries) for (const change of (Array.isArray(entry.changes) ? entry.changes : []) as Record<string, unknown>[]) {
      const value = (change.value ?? {}) as Record<string, unknown>;
      const account = String((value.metadata as Record<string, unknown> | undefined)?.phone_number_id ?? "");
      const contacts = (Array.isArray(value.contacts) ? value.contacts : []) as Record<string, unknown>[];
      for (const m of (Array.isArray(value.messages) ? value.messages : []) as Record<string, unknown>[]) {
        if (m.type !== "text" || typeof m.from !== "string") continue;
        const name = String(((contacts.find((c) => c.wa_id === m.from)?.profile ?? {}) as Record<string, unknown>).name ?? "");
        out.push({ channel: "whatsapp", account, from: m.from, name, text: String((m.text as Record<string, unknown> | undefined)?.body ?? "") });
      }
    }
  }
  if (body.object === "instagram") {
    for (const entry of entries) for (const ev of (Array.isArray(entry.messaging) ? entry.messaging : []) as Record<string, unknown>[]) {
      const message = (ev.message ?? {}) as Record<string, unknown>;
      if (message.is_echo || typeof message.text !== "string") continue;
      out.push({ channel: "instagram", account: String(entry.id ?? ""), from: String((ev.sender as Record<string, unknown> | undefined)?.id ?? ""), name: "", text: message.text });
    }
  }
  return out.filter((m) => m.account && m.from && m.text.trim());
}

