import { PRODUCT_GUIDE, type GuideEntry } from "./product-guide";

/**
 * Retrieval over the product guide (BM25). Small, in-process and deterministic: the guide is a few dozen entries, so the index
 * is built once per server instance and a lookup takes microseconds. Titles count double; a light stemmer folds plurals and
 * common endings so "photos", "photo" and "photographs" meet.
 */
const STOP = new Set("a an and are as at be by can do does for from how i in is it me my of on or the to what when where which who why with you your this that there".split(" "));
const SYNONYMS: Record<string, string> = { car: "vehicl", cars: "vehicl", vehicle: "vehicl", stock: "vehicl", listing: "showroom", website: "showroom", whatsapp: "whatsapp", insta: "instagram", ig: "instagram", ad: "campaign", ads: "campaign", advert: "campaign", promote: "campaign", staff: "team", employee: "team", user: "team", cost: "expens", spend: "expens", money: "capit", profit: "capit", followup: "follow", chase: "follow", remind: "follow", login: "sign", signin: "sign", otp: "two", "2fa": "two", price: "price", state: "state", states: "state", region: "region" };

export function stem(word: string): string {
  const w = SYNONYMS[word] ?? word;
  return w.length > 4 ? w.replace(/(ations|ation|ings|ing|ies|ied|ers|er|es|ed|s)$/, "") : w;
}
export const tokens = (text: string): string[] => text.toLowerCase().replace(/follow-up/g, "followup").split(/[^a-z0-9₹]+/).filter((t) => t && !STOP.has(t)).map(stem);

type Doc = { entry: GuideEntry; tf: Map<string, number>; len: number };
let index: { docs: Doc[]; df: Map<string, number>; avg: number } | null = null;

function build() {
  const docs = PRODUCT_GUIDE.map((entry) => {
    const terms = [...tokens(entry.title), ...tokens(entry.title), ...tokens(entry.where), ...tokens(entry.text)];
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { entry, tf, len: terms.length };
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  return { docs, df, avg: docs.reduce((a, d) => a + d.len, 0) / docs.length };
}

export function searchGuide(query: string, k = 4): { entry: GuideEntry; score: number }[] {
  index ??= build();
  const { docs, df, avg } = index;
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const N = docs.length, k1 = 1.4, b = 0.7;
  return docs.map((d) => {
    let score = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avg)));
    }
    return { entry: d.entry, score };
  }).filter((r) => r.score > 0.5).sort((a, b) => b.score - a.score).slice(0, k);
}

/** A page path turned into plain words for the assistant: where the person is right now. */
export function pageContext(path: string): string {
  const p = path.split("?")[0];
  const map: [RegExp, string][] = [
    [/^\/app\/overview/, "Overview (today's figures, follow-ups, things needing attention)"], [/^\/app\/alerts/, "Alerts"], [/^\/app\/inventory\/[^/]+/, "a car's page in Inventory"],
    [/^\/app\/inventory/, "the Inventory list"], [/^\/app\/stock-intelligence/, "Stock ageing"], [/^\/app\/pricing/, "Pricing"], [/^\/app\/market\/regions/, "Market prices by region"],
    [/^\/app\/market/, "Market listings"], [/^\/app\/state-prices/, "Prices by state"], [/^\/app\/acquisition/, "Buying"], [/^\/app\/leads\/[^/]+/, "a lead's page"], [/^\/app\/leads/, "the Leads list"],
    [/^\/app\/conversations/, "Conversations"], [/^\/app\/automations/, "Follow-up rules"], [/^\/app\/advertising/, "Advertising"], [/^\/app\/showroom/, "Showroom"], [/^\/app\/capital/, "Capital & profit"],
    [/^\/app\/revenue/, "Revenue & expenses"], [/^\/app\/investors/, "Investors"], [/^\/app\/reports/, "Reports"], [/^\/app\/settings\/([a-z-]+)/, "Settings"],
  ];
  const hit = map.find(([re]) => re.test(p));
  const ref = /^\/app\/(inventory|leads)\/([A-Za-z0-9-]{1,40})$/.exec(p)?.[2];
  return hit ? `${hit[1]}${ref ? ` (record ${ref})` : ""}` : "the workspace";
}
