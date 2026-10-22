// Money is stored as integer paise. 1 lakh (L) = 1,00,000 rupees; 1 crore (Cr) = 1,00,00,000 rupees.
export const PAISE_PER_RUPEE = 100;
export const PAISE_PER_LAKH = 10_000_000;
export const PAISE_PER_CRORE = 1_000_000_000;

export const lakh = (value: number): number => Math.round(value * PAISE_PER_LAKH);
export const rupees = (value: number): number => Math.round(value * PAISE_PER_RUPEE);

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const plain = new Intl.NumberFormat("en-IN");

export const MISSING = "—";

type Money = number | null | undefined;

/** Standard view: ₹28.5 L / ₹3.80 Cr. Missing is an em dash, never zero. */
export function formatMoney(paise: Money, options: { dp?: 1 | 2 } = {}): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return MISSING;
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  if (abs >= PAISE_PER_CRORE) return `${sign}₹${(abs / PAISE_PER_CRORE).toFixed(2)} Cr`;
  if (abs >= PAISE_PER_LAKH || abs === 0) {
    const dp = options.dp ?? 1;
    return `${sign}₹${(abs / PAISE_PER_LAKH).toFixed(dp)} L`;
  }
  // Below one lakh, amounts of ₹5,000 or more stay in lakh with two decimals (₹0.50 L); smaller amounts show in rupees.
  const rupeeValue = abs / PAISE_PER_RUPEE;
  if (rupeeValue >= 5_000) return `${sign}₹${(abs / PAISE_PER_LAKH).toFixed(2)} L`;
  return `${sign}₹${inr.format(Math.round(rupeeValue))}`;
}

/** Lakh figure with two decimals for small signed values (impact and contribution lines). */
export function formatLakh2(paise: Money): string {
  return formatMoney(paise, { dp: 2 });
}

/** Exact money for inputs, confirmations, exports and tooltips: ₹28,50,000.00 */
export function formatExact(paise: Money): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return MISSING;
  const sign = paise < 0 ? "-" : "";
  return `${sign}₹${inrExact.format(Math.abs(paise) / PAISE_PER_RUPEE)}`;
}

/** Rupee amount without lakh abbreviation, used for campaign budgets: ₹9,000 */
export function formatRupees(paise: Money): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return MISSING;
  return `${paise < 0 ? "-" : ""}₹${inr.format(Math.abs(paise) / PAISE_PER_RUPEE)}`;
}

export function formatKm(km: number | null | undefined): string {
  return km === null || km === undefined ? MISSING : plain.format(km);
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? MISSING : plain.format(value);
}

export function formatPercent(value: number | null | undefined, options: { signed?: boolean; dp?: number } = {}): string {
  if (value === null || value === undefined || Number.isNaN(value)) return MISSING;
  const dp = options.dp ?? 1;
  const text = Math.abs(value).toFixed(dp);
  if (value < 0 && Number(text) !== 0) return `-${text}%`;
  return `${options.signed && Number(text) !== 0 ? "+" : ""}${text}%`;
}

/** Parse an Indian-grouped rupee input (₹25,90,000 / 2590000 / 25,90,000.50) to integer paise. */
export function parseRupeeInput(text: string): number | null {
  const cleaned = text.replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * PAISE_PER_RUPEE);
}

/** Parse a lakh input ("0.40") to paise. */
export function parseLakhInput(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * PAISE_PER_LAKH);
}

const IST = "Asia/Kolkata";
const monthShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function istParts(iso: string): { y: number; m: number; d: number; hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { y: pick("year"), m: pick("month"), d: pick("day"), hh: pick("hour") % 24, mm: pick("minute") };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** DD MMM YYYY */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const p = istParts(iso);
  return `${pad(p.d)} ${monthShort[p.m - 1]} ${p.y}`;
}

/** DD MMM */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const p = istParts(iso);
  return `${pad(p.d)} ${monthShort[p.m - 1]}`;
}

/** DD MMM YYYY / HH:mm IST */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const p = istParts(iso);
  return `${pad(p.d)} ${monthShort[p.m - 1]} ${p.y} / ${pad(p.hh)}:${pad(p.mm)} IST`;
}

/** DD MMM, HH:mm IST (current year implied) */
export function formatShortDateTime(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const p = istParts(iso);
  return `${pad(p.d)} ${monthShort[p.m - 1]} ${pad(p.hh)}:${pad(p.mm)}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return MISSING;
  const p = istParts(iso);
  return `${pad(p.hh)}:${pad(p.mm)}`;
}

export function monthKey(iso: string): string {
  const p = istParts(iso);
  return `${p.y}-${pad(p.m)}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${monthShort[m - 1]} ${y}`;
}

export function monthName(key: string): string {
  return monthShort[Number(key.split("-")[1]) - 1];
}

/** Whole calendar days between two instants using IST calendar dates. */
export function daysBetween(fromIso: string, toIso: string): number {
  const a = istParts(fromIso);
  const b = istParts(toIso);
  const da = Date.UTC(a.y, a.m - 1, a.d);
  const db = Date.UTC(b.y, b.m - 1, b.d);
  return Math.max(0, Math.round((db - da) / 86_400_000));
}

export function relativeAge(fromIso: string, toIso: string): string {
  const minutes = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Yesterday" : `${days} d ago`;
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

/** Plain lakh figure for ₹L axes and bars: ₹120 L */
export function formatLakhPlain(paise: number | null | undefined, dp = 0): string {
  if (paise === null || paise === undefined || Number.isNaN(paise)) return MISSING;
  return `₹${(paise / PAISE_PER_LAKH).toFixed(dp)} L`;
}
