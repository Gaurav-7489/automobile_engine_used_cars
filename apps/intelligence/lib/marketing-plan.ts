import type { Channel, Vehicle } from "./domain";
import { checkCopy } from "./actions/campaigns";
import { rupees } from "./format";

/**
 * Vehicle-level marketing recommendation (playbook module M02). Every car gets its own plan from its own record: who is likely
 * to buy it, what they worry about, the angle and content that answer that, which channels to use, and a starting budget.
 * VandLabs recommends; the dealership reviews, adjusts and approves the campaign it creates from the plan, and nothing is
 * spent until a person approves it.
 *
 * The rules are deterministic and explained: the same car always gets the same plan, and every plan lists the reasons behind
 * it. Inputs are only the car's own record (make, model, year, fuel, transmission, kilometres, owners, price, days in stock,
 * enquiries in the last 14 days) and the dealership's city.
 */
export const PLAN_VERSION = "plan-v1.0";

export type Segment = "budget" | "family" | "premium" | "value";
export type MarketingPlan = {
  version: string;
  segment: Segment;
  segmentLabel: string;
  buyer: string;
  concerns: string[];
  angle: string;
  content: string[];
  channels: { id: Channel["id"]; name: string; why: string; share: number }[];
  audience: { area: string; radiusKm: number; note: string };
  budget: { daily: number; total30: number; why: string };
  headline: string;
  body: string;
  priority: "act now" | "steady" | "light touch";
  reasons: string[];
};

const PREMIUM_MAKES = ["bmw", "mercedes-benz", "mercedes", "audi", "volvo", "jaguar", "land rover", "lexus", "mini", "porsche", "jeep"];
const FAMILY_MODELS = ["creta", "seltos", "xuv", "scorpio", "innova", "crysta", "ertiga", "fortuner", "nexon", "brezza", "venue", "harrier", "hector", "thar", "sonet", "kushaq", "taigun", "duster", "carens", "marazzo", "safari", "alcazar", "xl6", "carnival", "compass", "grand vitara", "hycross", "punch", "magnite", "kiger", "triber", "bolero", "astor", "elevate", "fronx"];
const BUDGET_MODELS = ["alto", "wagon r", "wagonr", "kwid", "celerio", "s-presso", "spresso", "eon", "santro", "i10", "tiago", "redi-go", "redigo", "nano", "swift", "ignis", "beat", "spark", "glanza", "baleno", "polo", "i20", "jazz", "altroz"];

const LAKH = 10_000_000; // paise
const has = (list: string[], text: string) => list.some((m) => text.includes(m));

export function segmentOf(v: Pick<Vehicle, "make" | "model" | "asking">): Segment {
  const make = v.make.toLowerCase(), model = v.model.toLowerCase();
  if (has(PREMIUM_MAKES, make) || (v.asking ?? 0) >= 25 * LAKH) return "premium";
  if (has(FAMILY_MODELS, model)) return "family";
  if (has(BUDGET_MODELS, model) || (v.asking !== null && v.asking < 6 * LAKH)) return "budget";
  return "value";
}

const SEGMENT: Record<Segment, { label: string; buyer: string; concerns: string[]; angle: string; content: string[]; daily: number; meta: number }> = {
  budget: {
    label: "Budget hatchback", buyer: "First-time owners and city commuters watching every rupee.",
    concerns: ["Will it be cheap to run?", "Is it reliable?", "What will the EMI be?"],
    angle: "Price-led and practical: the price, kilometres and fuel type up front, with an easy way to ask a question.",
    content: ["One clear photo with the price on it", "Short post on running costs, using the car's own fuel and kilometre figures", "\"First car\" or \"city commute\" framing", "A quick-reply WhatsApp link in every post"],
    daily: 300, meta: 0.4,
  },
  family: {
    label: "Family SUV / MPV", buyer: "Families upgrading for space, comfort and road trips.",
    concerns: ["Will the family fit?", "Is it comfortable on long drives?", "Is it safe?"],
    angle: "Space and family use: seats, boot and comfort, shown rather than claimed.",
    content: ["Walkaround video showing every row of seats and the boot", "Weekend-trip framing", "Invitation to bring the family for a viewing", "Carousel: exterior, cabin, boot, odometer"],
    daily: 500, meta: 0.55,
  },
  premium: {
    label: "Premium vehicle", buyer: "Established buyers who value condition, exclusivity and how they are treated.",
    concerns: ["Is it genuine and well maintained?", "Is the history clear?", "Will I be looked after?"],
    angle: "Condition and care: fewer, better visuals and a personal invitation, not a price shout.",
    content: ["A detailed condition story with 10 or more high-quality photos", "Private viewing appointment offer", "Direct contact with a senior person at the dealership", "Avoid discount language"],
    daily: 700, meta: 0.5,
  },
  value: {
    label: "Everyday sedan / value car", buyer: "Practical buyers comparing a few similar cars on price and condition.",
    concerns: ["Is this a fair price for the year and kilometres?", "How many owners?", "Can I see it this week?"],
    angle: "Clear facts that make comparison easy: year, kilometres, owners and price in the first line.",
    content: ["Photo carousel with the odometer and service book", "Plain facts post: year, km, owners, fuel", "Test-drive invitation", "Model-name search ad for people already looking"],
    daily: 400, meta: 0.45,
  },
};

export type PlanInput = { vehicle: Vehicle; city: string; daysInStock: number };

export function recommendPlan({ vehicle: v, city, daysInStock }: PlanInput): MarketingPlan {
  const segment = segmentOf(v);
  const s = SEGMENT[segment];
  const reasons: string[] = [`${s.label}: ${v.make} ${v.model}${v.asking ? ` at ₹${(v.asking / LAKH).toFixed(1)} lakh` : ""}.`];
  const slow = daysInStock > 45 && v.enquiries14d <= Math.max(1, v.cohortMedianEnquiries);
  const busy = v.enquiries14d >= Math.max(3, v.cohortMedianEnquiries * 2);
  let multiplier = 1;
  if (slow) { multiplier = 1.5; reasons.push(`${daysInStock} days in stock with ${v.enquiries14d} enquiries in 14 days: give it more attention now.`); }
  else if (busy) { multiplier = 0.5; reasons.push(`${v.enquiries14d} enquiries in 14 days: already drawing interest, keep spend light and follow up fast.`); }
  else reasons.push(`${daysInStock} days in stock, ${v.enquiries14d} enquiries in 14 days: a steady, test-sized budget.`);
  if (!v.hasImages && !(v.photos?.length)) reasons.push("No photos yet: add photos before running Facebook or Instagram ads.");
  const daily = Math.round(s.daily * multiplier / 50) * 50;
  const total30 = daily * 30;
  const metaShare = v.hasImages || v.photos?.length ? s.meta : 0;
  const channels: MarketingPlan["channels"] = [
    { id: "search", name: "Google Search", why: `People already searching "${v.make} ${v.model}" near ${city || "you"}.`, share: Math.round((1 - metaShare) * 100) },
    ...(metaShare ? [{ id: "meta" as const, name: "Facebook and Instagram", why: segment === "budget" ? "Reach local buyers with a clear price post." : "Show the car: photos and walkaround video do the selling.", share: Math.round(metaShare * 100) }] : []),
    { id: "owned", name: "Your website listing", why: "Every ad links to the car's own page, where enquiries become leads.", share: 0 },
  ];
  const radiusKm = segment === "premium" ? 80 : segment === "family" ? 40 : 20;
  const facts = [`${v.year}`, v.fuel.toLowerCase(), v.transmission.toLowerCase(), `${v.km.toLocaleString("en-IN")} km`, `${v.owners} owner${v.owners > 1 ? "s" : ""}`].join(" · ");
  const headline = (segment === "premium" ? `${v.year} ${v.make} ${v.model}${city ? ` in ${city}` : ""}` : segment === "budget" ? `${v.model}${v.asking ? ` for ₹${(v.asking / LAKH).toFixed(1)} lakh` : ""}` : `${v.year} ${v.make} ${v.model}${city ? `, ${city}` : ""}`).slice(0, 70);
  const ask = segment === "premium" ? "Book a private viewing." : segment === "family" ? "Bring the family for a look." : "Ask for details on WhatsApp.";
  let body = `${facts}. ${ask}`;
  if (checkCopy(`${headline} ${body}`).length) body = `${facts}. Request vehicle details.`;
  return {
    version: PLAN_VERSION, segment, segmentLabel: s.label, buyer: s.buyer, concerns: s.concerns, angle: s.angle, content: s.content, channels,
    audience: { area: city || "Your city", radiusKm, note: segment === "premium" ? "Wider area: premium buyers travel for the right car." : "Local buyers who can visit this week." },
    budget: { daily: rupees(daily), total30: rupees(total30), why: slow ? "Raised because the car is ageing with few enquiries." : busy ? "Lowered because the car is already getting enquiries." : "A starting test budget. Adjust after the first week's enquiries." },
    headline, body, priority: slow ? "act now" : busy ? "light touch" : "steady", reasons,
  };
}
