import type { FuelType, Transmission, Vehicle } from "@vandlabs/contracts";

/** Conversational used-car discovery for buyers.
 * Deterministic parsing, hard filtering and explainable ranking over the records it is given.
 * It never invents vehicles, prices, mileage or condition, never widens a stated budget or
 * location on its own, and reports every requirement it cannot verify. Pure: safe in browsers. */

export const discoveryVersion = "discovery-v1";
export const discoveryLimits = { turns: 10, turnLength: 300, page: 8, maxPage: 24 } as const;

export type DiscoveryVehicle = Pick<Vehicle, "id" | "make" | "model" | "variant" | "year" | "price" | "mileage" | "fuelType" | "transmission" | "ownership" | "bodyType" | "condition" | "exteriorColor" | "features" | "specifications" | "availabilityStatus" | "publishStatus" | "locationId">;
export interface DiscoveryLocation { id: string; name: string; city: string }
export type BodyStyle = "suv" | "sedan" | "hatchback" | "muv" | "coupe" | "convertible" | "pickup" | "wagon";
export type DiscoveryFuel = FuelType | "cng" | "lpg";
export type Preference = "economy" | "low_km" | "reliability" | "low_maintenance" | "family" | "first_time" | "city" | "highway" | "premium" | "value" | "newest";
export type UnsupportedNeed = "performance" | "safety" | "resale" | "boot_space" | "comfort" | "radius" | "near_me";
export type SortOrder = "price_asc" | "price_desc" | "year_desc" | "km_asc";

export interface DiscoveryIntent {
  budget?: { min?: number; max?: number; around?: number };
  cities?: string[]; radiusKm?: number;
  bodies?: BodyStyle[]; excludeBodies?: BodyStyle[];
  makes?: string[]; excludeMakes?: string[]; models?: string[];
  fuels?: DiscoveryFuel[]; excludeFuels?: DiscoveryFuel[];
  transmission?: Transmission;
  minYear?: number; maxYear?: number; maxKm?: number; maxOwners?: number; minSeats?: number;
  colours?: string[]; conditions?: Vehicle["condition"][]; keywords?: string[];
  preferences?: Preference[]; focus?: Preference | SortOrder; sort?: SortOrder; features?: string[];
  unsupported?: UnsupportedNeed[];
}
export interface DiscoveryChip { key: string; label: string; kind: "requirement" | "preference" | "unsupported"; remove?: string }
export interface DiscoveryNotice { kind: "unsupported" | "unverified" | "reserved" | "unrecognised" | "location" | "ambiguous" | "limit"; text: string }
export interface DiscoverySuggestion { label: string; turn: string }
export interface DiscoveryMatch { vehicleId: string; rank: number; summary: string; requirements: string[]; strengths: string[]; caveats: string[] }
export interface DiscoveryResult {
  version: string; turns: string[]; intent: DiscoveryIntent; chips: DiscoveryChip[];
  thread: { turn: string; reply: string }[]; reply: string; notices: DiscoveryNotice[]; suggestions: DiscoverySuggestion[];
  total: number; reserved: number; results: DiscoveryMatch[]; cursor: number; nextCursor: number | null;
}

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

type Entry<T> = { value: T; aliases: string[] };
const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toNumber = (value: string) => numberWords[value] ?? Number(value.replace(/,/g, ""));
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const pattern = (alias: string) => escape(alias).replace(/ /g, "[\\s-]+");
const compact = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const titleCase = (value: string) => value.replace(/\b[a-z]/g, letter => letter.toUpperCase());
const words = (value: string) => value.toLowerCase().replace(/-/g, " ").split(/[^a-z0-9&+.]+/).map(word => word.replace(/^[.+]+|[.+]+$/g, "")).filter(Boolean);

const bodies: Entry<BodyStyle>[] = [
  { value: "suv", aliases: ["suv", "suvs", "compact suv", "compact suvs", "crossover", "crossovers", "sports utility", "sport utility"] },
  { value: "sedan", aliases: ["sedan", "sedans", "saloon", "saloons"] },
  { value: "hatchback", aliases: ["hatchback", "hatchbacks", "hatch", "hatches", "small car", "small cars"] },
  { value: "muv", aliases: ["muv", "muvs", "mpv", "mpvs", "minivan", "minivans", "people carrier"] },
  { value: "coupe", aliases: ["coupe", "coupes"] },
  { value: "convertible", aliases: ["convertible", "convertibles", "cabriolet", "cabrio", "roadster", "open top"] },
  { value: "pickup", aliases: ["pickup", "pickups", "pick up", "pickup truck", "truck"] },
  { value: "wagon", aliases: ["wagon", "estate", "station wagon"] },
];
const bodyLabels: Record<BodyStyle, [string, string]> = { suv: ["SUV", "SUVs"], sedan: ["sedan", "sedans"], hatchback: ["hatchback", "hatchbacks"], muv: ["MUV", "MUVs"], coupe: ["coupe", "coupes"], convertible: ["convertible", "convertibles"], pickup: ["pickup", "pickups"], wagon: ["wagon", "wagons"] };
const fuels: Entry<DiscoveryFuel>[] = [
  { value: "petrol", aliases: ["petrol", "gasoline"] },
  { value: "diesel", aliases: ["diesel", "diesels"] },
  { value: "electric", aliases: ["electric", "ev", "evs", "battery electric", "bev"] },
  { value: "hybrid", aliases: ["hybrid", "hybrids", "phev", "plug in hybrid", "mild hybrid", "strong hybrid"] },
  { value: "cng", aliases: ["cng"] },
  { value: "lpg", aliases: ["lpg"] },
];
const transmissions: Entry<Transmission>[] = [
  { value: "automatic", aliases: ["automatic", "automatics", "auto", "amt", "cvt", "dct", "dsg", "torque converter", "self shifting", "no clutch"] },
  { value: "manual", aliases: ["manual", "manuals", "stick shift", "stick"] },
];
const colours = ["white", "black", "grey", "gray", "silver", "blue", "red", "green", "brown", "beige", "orange", "yellow", "gold", "maroon", "bronze", "purple"];
const conditions: Entry<Vehicle["condition"][]>[] = [
  { value: ["excellent"], aliases: ["excellent condition", "mint condition", "like new"] },
  { value: ["excellent", "good"], aliases: ["good condition", "well maintained", "well kept"] },
];
const makes: Entry<string>[] = [
  ["Maruti Suzuki", "maruti suzuki", "maruti", "suzuki"], ["Hyundai", "hyundai"], ["Tata", "tata motors", "tata"], ["Mahindra", "mahindra"],
  ["Kia", "kia"], ["Honda", "honda"], ["Toyota", "toyota"], ["Renault", "renault"], ["Nissan", "nissan"], ["Skoda", "skoda"],
  ["Volkswagen", "volkswagen", "vw"], ["MG", "mg motor", "mg", "morris garages"], ["BMW", "bmw"],
  ["Mercedes-Benz", "mercedes benz", "mercedes", "merc", "benz"], ["Audi", "audi"], ["Volvo", "volvo"], ["Jeep", "jeep"],
  ["Ford", "ford"], ["Lexus", "lexus"], ["Jaguar", "jaguar"], ["Land Rover", "land rover"], ["Porsche", "porsche"],
  ["Mini", "mini cooper"], ["Citroen", "citroen"], ["BYD", "byd"], ["Tesla", "tesla"], ["Fiat", "fiat"], ["Chevrolet", "chevrolet", "chevy"],
  ["Datsun", "datsun"], ["Isuzu", "isuzu"],
].map(([value, ...aliases]) => ({ value, aliases }));
// Common Indian models. A trailing * marks ordinary words that only count beside their make ("Honda City").
const commonModels: [string, string, ...string[]][] = [
  ["Maruti Suzuki", "Swift*"], ["Maruti Suzuki", "Dzire", "swift dzire"], ["Maruti Suzuki", "Baleno"], ["Maruti Suzuki", "Brezza", "vitara brezza"],
  ["Maruti Suzuki", "Ertiga"], ["Maruti Suzuki", "XL6"], ["Maruti Suzuki", "Ciaz"], ["Maruti Suzuki", "Wagon R", "wagonr"], ["Maruti Suzuki", "Alto"],
  ["Maruti Suzuki", "Celerio"], ["Maruti Suzuki", "Ignis"], ["Maruti Suzuki", "Fronx"], ["Maruti Suzuki", "Grand Vitara"], ["Maruti Suzuki", "Jimny"],
  ["Hyundai", "Creta"], ["Hyundai", "Venue*"], ["Hyundai", "i20"], ["Hyundai", "Grand i10", "i10", "grand i10 nios"], ["Hyundai", "Verna"],
  ["Hyundai", "Aura*"], ["Hyundai", "Exter"], ["Hyundai", "Alcazar"], ["Hyundai", "Tucson"], ["Hyundai", "Kona"],
  ["Tata", "Nexon"], ["Tata", "Punch*"], ["Tata", "Harrier"], ["Tata", "Safari*"], ["Tata", "Tiago"], ["Tata", "Tigor"], ["Tata", "Altroz"], ["Tata", "Curvv"],
  ["Mahindra", "Thar"], ["Mahindra", "Scorpio", "scorpio n"], ["Mahindra", "XUV700", "xuv 700"], ["Mahindra", "XUV300", "xuv 300", "xuv 3xo", "xuv3xo"], ["Mahindra", "Bolero"],
  ["Kia", "Seltos"], ["Kia", "Sonet"], ["Kia", "Carens"], ["Kia", "Carnival*"],
  ["Honda", "City*"], ["Honda", "Amaze*"], ["Honda", "Jazz*"], ["Honda", "Elevate*"], ["Honda", "Civic"], ["Honda", "WR-V", "wrv"],
  ["Toyota", "Innova", "innova crysta"], ["Toyota", "Innova Hycross", "hycross"], ["Toyota", "Fortuner"], ["Toyota", "Glanza"],
  ["Toyota", "Urban Cruiser Hyryder", "hyryder"], ["Toyota", "Camry"], ["Toyota", "Corolla Altis", "corolla"],
  ["Volkswagen", "Polo*"], ["Volkswagen", "Vento"], ["Volkswagen", "Virtus"], ["Volkswagen", "Taigun"], ["Volkswagen", "Tiguan"],
  ["Skoda", "Kushaq"], ["Skoda", "Slavia"], ["Skoda", "Octavia"], ["Skoda", "Superb*"], ["Skoda", "Kodiaq"], ["Skoda", "Rapid*"],
  ["Renault", "Kwid"], ["Renault", "Kiger"], ["Renault", "Triber"], ["Renault", "Duster"], ["Nissan", "Magnite"],
  ["MG", "Hector"], ["MG", "Astor"], ["MG", "ZS EV"], ["MG", "Comet*"], ["MG", "Windsor*"], ["MG", "Gloster"],
  ["Jeep", "Compass*"], ["Jeep", "Meridian"], ["Jeep", "Wrangler"], ["Ford", "EcoSport"], ["Ford", "Endeavour"],
  ["BMW", "3 Series"], ["BMW", "5 Series"], ["BMW", "X1"], ["BMW", "X3"], ["BMW", "X5"],
  ["Mercedes-Benz", "C-Class"], ["Mercedes-Benz", "E-Class"], ["Mercedes-Benz", "GLA"], ["Mercedes-Benz", "GLC"], ["Mercedes-Benz", "GLE"],
  ["Audi", "A4"], ["Audi", "A6"], ["Audi", "Q3"], ["Audi", "Q5"], ["Audi", "Q7"], ["Volvo", "XC40"], ["Volvo", "XC60"], ["Volvo", "XC90"], ["Volvo", "S90"],
  ["Land Rover", "Range Rover Evoque", "evoque"], ["Land Rover", "Defender*"], ["Tesla", "Model 3"], ["Tesla", "Model Y"],
];
const cityTable: [string, ...string[]][] = [
  ["Delhi", "new delhi"], ["Mumbai", "bombay"], ["Bengaluru", "bangalore", "blr"], ["Chennai", "madras"], ["Hyderabad"], ["Pune"], ["Kolkata", "calcutta"],
  ["Ahmedabad"], ["Chandigarh"], ["Jaipur"], ["Lucknow"], ["Kochi", "cochin", "ernakulam"], ["Gurugram", "gurgaon"], ["Noida"], ["Ghaziabad"],
  ["Faridabad"], ["Mohali"], ["Panchkula"], ["Indore"], ["Bhopal"], ["Nagpur"], ["Surat"], ["Vadodara", "baroda"], ["Coimbatore"],
  ["Thiruvananthapuram", "trivandrum"], ["Mysuru", "mysore"], ["Mangaluru", "mangalore"], ["Visakhapatnam", "vizag"], ["Ludhiana"], ["Amritsar"],
  ["Dehradun"], ["Patna"], ["Bhubaneswar"], ["Guwahati"], ["Goa", "panaji"], ["Nashik"], ["Rajkot"], ["Kanpur"], ["Agra"], ["Varanasi"],
  ["Raipur"], ["Ranchi"], ["Jalandhar"], ["Kozhikode", "calicut"], ["Thrissur"],
];
const cityGroups: Entry<string[]>[] = [
  { value: ["Delhi", "Gurugram", "Noida", "Ghaziabad", "Faridabad"], aliases: ["delhi ncr", "ncr"] },
  { value: ["Chandigarh", "Mohali", "Panchkula"], aliases: ["tricity"] },
];
const preferences: Entry<Preference>[] = [
  { value: "economy", aliases: ["good mileage", "better mileage", "best mileage", "high mileage", "great mileage", "more mileage", "mileage", "fuel efficient", "fuel efficiency", "fuel economy", "efficient", "economical", "low running cost", "low running costs", "cheap to run", "kmpl", "saves fuel", "less fuel"] },
  { value: "low_km", aliases: ["low km", "low kms", "low kilometres", "low kilometers", "less driven", "lightly used", "barely driven", "low odometer", "low mileage"] },
  { value: "reliability", aliases: ["reliable", "reliability", "dependable", "trouble free", "durable", "long lasting"] },
  { value: "low_maintenance", aliases: ["low maintenance", "cheap to maintain", "easy to maintain", "low service cost", "low service costs", "maintenance"] },
  { value: "family", aliases: ["family", "families", "kids", "children", "spacious"] },
  { value: "first_time", aliases: ["first time buyer", "first time buyers", "first time", "first car", "beginner", "beginners", "new driver", "learner"] },
  { value: "city", aliases: ["city driving", "city use", "city drives", "urban", "traffic", "commute", "commuting", "daily office"] },
  { value: "highway", aliases: ["highway", "highways", "long drive", "long drives", "road trip", "road trips", "touring", "long distance"] },
  { value: "premium", aliases: ["luxury", "luxurious", "premium", "high end"] },
  { value: "value", aliases: ["value for money", "best value", "good value", "budget friendly", "affordable", "cheap", "inexpensive"] },
  { value: "newest", aliases: ["newest", "latest", "recent", "newer", "new"] },
];
const unsupportedNeeds: Entry<UnsupportedNeed>[] = [
  { value: "performance", aliases: ["powerful", "power", "fast", "sporty", "performance", "bhp", "horsepower", "torque", "quick"] },
  { value: "safety", aliases: ["safe", "safest", "safety", "ncap", "crash test", "crash rating", "star rating", "airbags"] },
  { value: "resale", aliases: ["resale", "resale value", "resells well", "holds value"] },
  { value: "boot_space", aliases: ["boot space", "boot", "luggage", "trunk space", "trunk"] },
  { value: "comfort", aliases: ["comfortable", "comfort", "smooth ride", "ride quality"] },
  { value: "near_me", aliases: ["near me", "nearby", "around me", "close to me", "my location"] },
];
const unsupportedText: Record<UnsupportedNeed, string> = {
  performance: "Power and performance figures aren't recorded for these listings, so they can't be ranked by them.",
  safety: "Safety ratings aren't recorded here. Check the model's official crash-test rating before deciding.",
  resale: "Future resale value isn't predicted. No price or value outcome is guaranteed.",
  boot_space: "Boot space isn't recorded for these listings.",
  comfort: "Ride comfort isn't measured. A test drive is the best way to judge it.",
  radius: "Distance search isn't available yet, so results use the city you named.",
  near_me: "Your location isn't used. Name a city to filter by place.",
};
const sorts: Entry<SortOrder>[] = [
  { value: "price_asc", aliases: ["cheapest first", "cheapest", "lowest price", "lowest prices", "price low to high", "least expensive", "sort by price"] },
  { value: "price_desc", aliases: ["most expensive", "highest price", "price high to low"] },
  { value: "year_desc", aliases: ["newest first", "latest first", "most recent first"] },
  { value: "km_asc", aliases: ["lowest km", "lowest kms", "least driven", "fewest km", "fewest kilometres", "fewest kilometers"] },
];
const features: Entry<{ label: string; test: RegExp }>[] = [
  { value: { label: "Sunroof", test: /sun ?roof|panoramic|moon ?roof/i }, aliases: ["sunroof", "sun roof", "panoramic sunroof", "panoramic roof", "moonroof"] },
  { value: { label: "360° camera", test: /360/ }, aliases: ["360 camera", "360 degree camera", "360 degree", "surround camera"] },
  { value: { label: "Reversing camera", test: /camera/i }, aliases: ["reverse camera", "reversing camera", "rear camera", "parking camera", "backup camera"] },
  { value: { label: "Adaptive cruise", test: /adaptive cruise/i }, aliases: ["adaptive cruise control", "adaptive cruise"] },
  { value: { label: "Cruise control", test: /cruise/i }, aliases: ["cruise control"] },
  { value: { label: "Smartphone integration", test: /carplay|android auto|smartphone/i }, aliases: ["apple carplay", "carplay", "android auto", "smartphone integration", "wireless carplay"] },
  { value: { label: "Leather seats", test: /leather/i }, aliases: ["leather seats", "leather"] },
  { value: { label: "Ventilated seats", test: /ventilated|cooled seat/i }, aliases: ["ventilated seats", "cooled seats"] },
  { value: { label: "ADAS", test: /adas|lane (?:keep|assist)/i }, aliases: ["adas", "lane assist", "lane keep assist"] },
  { value: { label: "Powered seats", test: /power(?:ed)? .*seat|electric seat/i }, aliases: ["powered seats", "power seats", "electric seats"] },
  { value: { label: "Service history", test: /service.?history|service records/i }, aliases: ["full service history", "service history", "service records"] },
];
const stopwords = new Set((
  "a an the i im i'm me my we our you your us want wanna need needs looking look find show give get search buy buying purchase suggest " +
  "recommend recommendation recommendations which what whats what's is are am be was best good great nice car cars vehicle vehicles one some " +
  "with and or in at near around from to of on for please pls plz can could would should will it that this these those only just also too very " +
  "really like prefer preferably ideally maybe something anything used second hand secondhand pre owned preowned old model models option options " +
  "available stock sale deal deals now today type make brand brands company price budget rs inr lakh lakhs lac lacs l crore crores cr k km kms " +
  "year years under below above over within upto up less more than max min about there here then them they has have having how much many do " +
  "does did not no any let lets let's go see tell help hi hello hey thanks thank ok okay well so but if as by into out new actually instead rather " +
  "again even sort order first daily drive driving test use using good better around people person family's who all show me chahiye mujhe ke ki ka " +
  "liye mein wala wali gaadi gadi tak andar se kam hai ho call contact whatsapp message email phone number reach"
).split(/\s+/));

export interface DiscoveryVocabulary {
  makes: Entry<string>[]; models: { value: string; make?: string; aliases: string[]; guarded: boolean }[];
  cities: Entry<string>[]; tokens: Set<string>;
}
const vocabularyCache = new WeakMap<DiscoveryVehicle[], Map<string, DiscoveryVocabulary>>();
/** Static Indian-market vocabulary plus the makes, models and cities of the supplied catalog. */
export function discoveryVocabulary(vehicles: DiscoveryVehicle[], locations: DiscoveryLocation[] = []): DiscoveryVocabulary {
  const signature = locations.map(location => location.city).join("|");
  const cached = vocabularyCache.get(vehicles)?.get(signature); if (cached) return cached;
  const makeList = makes.map(entry => ({ ...entry, aliases: [...entry.aliases] }));
  for (const v of vehicles) if (v.make?.trim() && !makeList.some(entry => compact(entry.value) === compact(v.make))) makeList.push({ value: v.make.trim(), aliases: [v.make.trim().toLowerCase()] });
  const modelList = commonModels.map(([make, name, ...extra]) => ({ value: name.replace("*", ""), make, guarded: name.endsWith("*"), aliases: [name.replace("*", "").toLowerCase(), ...extra] }));
  for (const v of vehicles) {
    const name = v.model?.trim(); if (!name) continue;
    const aliases = [name.toLowerCase(), compact(name)].filter(alias => alias.length > 1);
    const existing = modelList.find(entry => compact(entry.value) === compact(name) && (!entry.make || compact(entry.make) === compact(v.make)));
    if (existing) existing.aliases.push(...aliases); else modelList.push({ value: name, make: v.make, guarded: false, aliases });
  }
  for (const entry of modelList) entry.aliases = [...new Set(entry.aliases.map(alias => alias.replace(/-/g, " ")))];
  const cityList = cityTable.map(([value, ...aliases]) => ({ value, aliases: [value.toLowerCase(), ...aliases] }));
  for (const location of locations) if (location.city?.trim() && !cityList.some(entry => entry.aliases.includes(location.city.trim().toLowerCase()))) cityList.push({ value: location.city.trim(), aliases: [location.city.trim().toLowerCase()] });
  const vocabulary = { makes: makeList, models: modelList, cities: cityList, tokens: new Set(vehicles.flatMap(searchable)) };
  if (!vocabularyCache.has(vehicles)) vocabularyCache.set(vehicles, new Map());
  vocabularyCache.get(vehicles)!.set(signature, vocabulary);
  return vocabulary;
}
const searchable = (v: DiscoveryVehicle) => words([v.make, v.model, v.variant, v.bodyType, v.exteriorColor, ...(v.features ?? [])].join(" "));
/** Canonical makes named in free text, used to reject model output that mentions cars we never showed. */
export function makesMentioned(text: string) {
  const lower = ` ${text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ")} `;
  return makes.filter(entry => entry.aliases.some(alias => lower.includes(` ${alias.replace(/-/g, " ")} `))).map(entry => entry.value);
}
export function canonicalCity(value: string | undefined, vocabulary?: DiscoveryVocabulary) {
  const key = (value ?? "").trim().toLowerCase(); if (!key) return undefined;
  const entry = (vocabulary?.cities ?? cityTable.map(([city, ...aliases]) => ({ value: city, aliases: [city.toLowerCase(), ...aliases] }))).find(item => item.aliases.includes(key));
  return entry?.value ?? titleCase(key);
}
export function canonicalBody(value: string | undefined): BodyStyle | undefined {
  const key = ` ${(value ?? "").toLowerCase().replace(/[^a-z]+/g, " ")} `;
  return bodies.find(entry => entry.aliases.some(alias => key.includes(` ${alias} `)))?.value;
}

// ---------------------------------------------------------------------------------------------
// Turn parsing
// ---------------------------------------------------------------------------------------------

/** Removes phone numbers and email addresses so contact details never reach URLs or records. */
export function redactContact(input: string) {
  return input.replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, " ").replace(/(?:\+?91[\s-]?)?(?<!\d)[6-9]\d{4}[\s-]?\d{5}(?!\d)/g, " ").replace(/\d{10,}/g, " ");
}
/** Normalised, bounded conversation turns. Invalid entries are dropped, never repaired. */
export function sanitizeTurns(input: unknown): string[] {
  const values = Array.isArray(input) ? input : input === undefined || input === null ? [] : [input];
  return values.filter((value): value is string => typeof value === "string")
    .map(value => redactContact(value.normalize("NFKC")).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, discoveryLimits.turnLength))
    .filter(Boolean).slice(0, discoveryLimits.turns);
}

interface TurnParse {
  reset: boolean; additive: boolean; set: DiscoveryIntent; clear: Set<string>;
  preferences: Preference[]; sort?: SortOrder; unknown: string[]; notes: DiscoveryNotice[];
}
const unitValue: Record<string, number> = { k: 1e3, thousand: 1e3, l: 1e5, lk: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };
// Groups: currency, digits, unit. Digits never start inside a word ("xc60", "cars 10").
const AMOUNT = String.raw`(?:(?<![a-z0-9])(₹|rs|inr)\s*|(?<![a-z0-9.,₹]))(\d+(?:,\d+)*(?:\.\d+)?)\s*(lakhs?|lacs?|lac|lk|l|crores?|cr|thousand|k)?(?![a-z0-9])`;
const KM = String.raw`(?<![a-z0-9.,])(\d+(?:,\d+)*(?:\.\d+)?)\s*(k|thousand|lakh|l)?\s*(?:km|kms|kilomet(?:er|re)s?)(?![a-z])`;
const NUMBER = String.raw`(\d+|one|two|three|four|five|six|seven|eight|nine|ten)`;
const NEGATION = String.raw`(?:(no|not|non|except|excluding|without|avoid|other than|anything but|but not|don'?t want|do not want)[\s-]+)?`;
const clearTargets: [string, string[]][] = [
  ["budget", ["budget", "price", "prices", "cost", "price range"]], ["fuels", ["fuel", "fuel type", "fuels"]],
  ["transmission", ["transmission", "gearbox", "gear"]], ["bodies", ["body", "body type", "body style", "shape", "type", "car type"]],
  ["makes", ["brand", "brands", "make", "makes", "company", "manufacturer", "model"]], ["cities", ["city", "cities", "location", "locations", "place"]],
  ["years", ["year", "years", "model year", "age"]], ["maxKm", ["km", "kms", "kilometres", "kilometers", "odometer"]],
  ["maxOwners", ["owner", "owners", "ownership"]], ["minSeats", ["seats", "seating", "seater"]], ["colours", ["colour", "color", "colours", "colors"]],
  ["conditions", ["condition"]], ["keywords", ["keyword", "keywords"]], ["preferences", ["preference", "preferences"]], ["features", ["feature", "features"]],
];

function parseTurn(raw: string, vocabulary: DiscoveryVocabulary, currentYear: number, context: DiscoveryIntent): TurnParse {
  let text = ` ${raw.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-").replace(/\//g, " or ").replace(/[!?;:"“”()[\]{}]/g, " ").replace(/\brs\./g, "rs ").replace(/(\D)\.(?=\s|$)/g, "$1 ").replace(/\s+/g, " ").trim()} `;
  const parse: TurnParse = { reset: false, additive: /\b(also|too|as well|as an option)\b/.test(text), set: {}, clear: new Set(), preferences: [], unknown: [], notes: [] };
  const set = parse.set;
  const take = (regex: RegExp, handle: (...groups: string[]) => boolean | void) => {
    text = text.replace(regex, (...match) => handle(...match.slice(1, -2).map(group => (group as string | undefined) ?? "")) === false ? match[0] : " ");
  };
  const phrase = (aliases: string[]) => aliases.slice().sort((a, b) => b.length - a.length).map(pattern).join("|");
  const add = <T>(list: T[] | undefined, value: T) => [...new Set([...(list ?? []), value])];

  take(/\b(?:start over|start again|new search|reset|clear all|clear everything|begin again|fresh search)\b/g, () => { parse.reset = true; });
  take(/\b(?:anywhere|all cities|all locations|other cities)\b/g, () => { parse.clear.add("cities"); });
  take(/\b(?:manual (?:is|are) (?:fine|ok|okay)(?: too)?|automatic (?:is|are) (?:fine|ok|okay)(?: too)?|either transmission|either gearbox|manual or automatic|automatic or manual)\b/g, () => { parse.clear.add("transmission"); });
  take(/\bno (?:budget|price) ?(?:limit|cap)?\b/g, () => { parse.clear.add("budget"); });
  for (const [key, targets] of clearTargets) {
    const target = phrase(targets);
    take(new RegExp(String.raw`\b(?:any|every)\s+(?:${target})s?\b|\b(?:remove|drop|clear|ignore|forget|skip)\s+(?:the\s+|my\s+|that\s+)?(?:${target})(?:\s+filter)?\b|\b(?:${target})\s+(?:doesn'?t|does not|don'?t|do not)\s+matter\b`, "g"), () => { parse.clear.add(key); });
  }

  // Distance and odometer before money, so "within 50 km" and "under 40k km" are never read as prices.
  take(new RegExp(String.raw`\bwithin\s*${KM}\s*(?:of|from|around|near)\b|${KM}\s*(?:radius|away)\b`, "g"), (d1, _u1, d2) => {
    const value = toNumber(d1 || d2); if (!Number.isFinite(value)) return false; set.radiusKm = value;
  });
  const km = (digits: string, unit: string) => Math.round(toNumber(digits) * (unitValue[unit] ?? 1));
  take(new RegExp(String.raw`\b(under|below|less than|upto|up to|within|max(?:imum)?|not more than|no more than|at most|driven(?: less than| under| below)?)\s*${KM}`, "g"), (word, digits, unit) => {
    const value = km(digits, unit); if (!Number.isFinite(value)) return false;
    if (word === "within" && value < 1000) set.radiusKm = value; else if (value >= 100 && value <= 1000000) set.maxKm = value; else return false;
  });
  take(new RegExp(String.raw`${KM}\s*(?:or less|max(?:imum)?|and below|or below|or under)`, "g"), (digits, unit) => {
    const value = km(digits, unit); if (!(value >= 100 && value <= 1000000)) return false; set.maxKm = value;
  });
  take(/\bdriven\s*(?:less than|under|below)\s*(\d+(?:,\d+)*)\s*(k|thousand)?\b/g, (digits, unit) => {
    const value = km(digits, unit); if (!(value >= 100 && value <= 1000000)) return false; set.maxKm = value;
  });

  take(new RegExp(String.raw`\b${NUMBER}\s*-?\s*(?:seater|seaters|seats?)\b`, "g"), digits => { const value = toNumber(digits); if (!(value >= 2 && value <= 9)) return false; set.minSeats = value; });
  const family = (digits: string) => {
    const value = toNumber(digits); if (!(value >= 2 && value <= 9)) return false;
    if (value > 5) set.minSeats = Math.max(set.minSeats ?? 0, value); parse.preferences.push("family");
  };
  take(new RegExp(String.raw`\b(?:for\s+)?(?:a\s+)?family of\s*${NUMBER}(?:\s*(?:people|persons|members|adults))?\b`, "g"), family);
  take(new RegExp(String.raw`\b(?:we are|we're|for)?\s*${NUMBER}\s*(?:people|persons|members|passengers|of us)\b`, "g"), family);

  take(/\b(?:first|1st|single|one|original)\s*-?\s*owner(?:ship)?s?\b/g, () => { set.maxOwners = 1; });
  take(/\b(?:second|2nd)\s*-?\s*owners?\b/g, () => { set.maxOwners = 2; });
  take(new RegExp(String.raw`\b(?:max(?:imum)?|up to|upto|not more than|no more than|at most)\s*${NUMBER}\s*owners?\b`, "g"), digits => { const value = toNumber(digits); if (!(value >= 1 && value <= 9)) return false; set.maxOwners = value; });
  take(new RegExp(String.raw`\b(?:less than|fewer than|under)\s*${NUMBER}\s*owners?\b`, "g"), digits => { const value = toNumber(digits); if (!(value >= 2 && value <= 9)) return false; set.maxOwners = value - 1; });

  const yearOk = (value: number) => Number.isInteger(value) && value >= 1980 && value <= currentYear + 1;
  take(new RegExp(String.raw`\b(?:last|past)\s*${NUMBER}\s*years?\b|\b(?:less than|under|below|not older than|max(?:imum)?|within|at most)\s*${NUMBER}\s*years?\s*old\b|\b${NUMBER}\s*years?\s*old\s*(?:or newer|or less|max(?:imum)?)\b`, "g"), (a, b, c) => {
    const age = toNumber(a || b || c); if (!(age >= 0 && age <= 30)) return false; set.minYear = currentYear - age;
  });
  take(/\b(?:(?:between|from)\s*)?((?:19|20)\d{2})\s*(?:and|-|to|till|until)\s*((?:19|20)\d{2})\b/g, (a, b) => {
    const [low, high] = [Number(a), Number(b)].sort((x, y) => x - y); if (!yearOk(low) || !yearOk(high)) return false; set.minYear = low; set.maxYear = high;
  });
  take(/\b((?:19|20)\d{2})\s*(?:\+|or newer|or later|or above|and above|and newer|and later|onwards|or after|model or (?:above|newer)|model onwards)(?=\s|$)/g, year => { if (!yearOk(Number(year))) return false; set.minYear = Number(year); });
  take(/\b(after|since|from|newer than|not older than|later than|at least)\s*((?:19|20)\d{2})\b/g, (word, year) => {
    const value = Number(year); if (!yearOk(value)) return false; set.minYear = ["after", "newer than", "later than"].includes(word) ? value + 1 : value;
  });
  take(/\b(before|older than|until|till|up to|upto)\s*((?:19|20)\d{2})\b/g, (word, year) => {
    const value = Number(year); if (!yearOk(value)) return false; set.maxYear = ["before", "older than"].includes(word) ? value - 1 : value;
  });

  // Money. Bare amounts under 1,000 in a price phrase mean lakh ("under 10"), as Indian buyers say it.
  const money = (currency: string, digits: string, unit: string, priceContext: boolean) => {
    const value = Number(digits.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) return undefined;
    if (!unit && !currency && Number.isInteger(value) && value >= 1950 && value <= 2035) return undefined;
    const scaled = unit ? value * (unitValue[unit] ?? 1) : currency || value >= 1000 ? value : priceContext ? value * 1e5 : undefined;
    return scaled !== undefined && scaled >= 10000 && scaled <= 5e8 ? Math.round(scaled) : undefined;
  };
  const budget = (patch: { min?: number; max?: number; around?: number }) => {
    set.budget = { ...set.budget, ...patch };
    if (patch.max !== undefined && patch.max < 100000 && !parse.notes.some(note => note.kind === "ambiguous")) parse.notes.push({ kind: "ambiguous", text: `Read the budget as ${rupees(patch.max)}. Add “km” if you meant kilometres.` });
  };
  take(new RegExp(String.raw`\b(?:between\s+|from\s+)?${AMOUNT}\s*(?:-|to|and)\s*${AMOUNT}`, "g"), (c1, d1, u1, c2, d2, u2) => {
    if (!(u1 || u2 || c1 || c2)) return false;
    const low = money(c1 || c2, d1, u1 || (Number(d1.replace(/,/g, "")) < 1000 ? u2 : ""), true), high = money(c2 || c1, d2, u2 || u1, true);
    if (low === undefined || high === undefined || low >= high) return false; budget({ min: low, max: high, around: undefined });
  });
  take(new RegExp(String.raw`\b(?:around|about|approx(?:imately)?|roughly|nearly|close to)\s*${AMOUNT}`, "g"), (currency, digits, unit) => {
    const value = money(currency, digits, unit, Boolean(unit || currency) || /\bbudget\b/.test(text)); if (value === undefined) return false;
    budget({ min: Math.round(value * 0.9), max: Math.round(value * 1.1), around: value });
  });
  take(new RegExp(String.raw`\b(under|below|less than|lesser than|upto|up to|within|max(?:imum)?|not more than|no more than|cheaper than|at most|budget(?:\s+(?:of|is|around|upto|up to|under|max))?|in|for)\s*${AMOUNT}`, "g"), (word, currency, digits, unit) => {
    const loose = word === "in" || word === "for";
    const value = money(currency, digits, unit, !loose); if (value === undefined || (loose && !unit && !currency)) return false;
    budget({ max: value, around: undefined });
  });
  take(new RegExp(String.raw`\b(above|over|more than|at least|min(?:imum)?|starting(?: from| at)?|from)\s*${AMOUNT}`, "g"), (word, currency, digits, unit) => {
    const value = money(currency, digits, unit, word !== "from"); if (value === undefined || (word === "from" && !unit && !currency)) return false;
    budget({ min: value, around: undefined });
  });
  take(new RegExp(String.raw`${AMOUNT}\s*(?:budget|max(?:imum)?|or less|or below|and below|or under)`, "g"), (currency, digits, unit) => {
    const value = money(currency, digits, unit, true); if (value === undefined) return false; budget({ max: value, around: undefined });
  });
  take(new RegExp(AMOUNT, "g"), (currency, digits, unit) => {
    if (!unit && !currency) return false; const value = money(currency, digits, unit, true); if (value === undefined) return false; budget({ max: value, around: undefined });
  });
  const bareYears: number[] = [];
  take(/\b((?:19|20)\d{2})\b/g, year => { if (!yearOk(Number(year))) return false; bareYears.push(Number(year)); });
  if (bareYears.length) { set.minYear = Math.min(...bareYears); set.maxYear = Math.max(...bareYears); }

  // Dictionaries: longest phrases first, each with an optional negation ("not diesel", "no BMW").
  const dictionary = <T>(entries: { value: T; aliases: string[] }[], handle: (value: T, negated: boolean) => boolean | void) => {
    const aliases = entries.flatMap(entry => entry.aliases.map(alias => ({ alias, entry }))).sort((a, b) => b.alias.length - a.alias.length);
    for (const { alias, entry } of aliases) {
      const regex = new RegExp(String.raw`(?<![a-z0-9])${NEGATION}${pattern(alias)}(?![a-z0-9])`, "g");
      if (regex.test(text)) { regex.lastIndex = 0; take(regex, negation => handle(entry.value, Boolean(negation))); }
    }
  };
  dictionary(sorts, value => { parse.sort = value; });
  dictionary(features, (value, negated) => { if (!negated) set.features = add(set.features, value.label); });
  const mentions = (aliases: string[]) => aliases.some(alias => new RegExp(String.raw`(?<![a-z0-9])${pattern(alias)}(?![a-z0-9])`).test(text));
  const mentionedMakes = vocabulary.makes.filter(entry => mentions(entry.aliases)).map(entry => entry.value);
  dictionary(vocabulary.models.map(entry => ({ value: entry, aliases: entry.aliases })), (model, negated) => {
    const sameMake = (make: string) => compact(make) === compact(model.make ?? "");
    if (model.guarded && !mentionedMakes.some(sameMake) && !(context.makes ?? []).some(sameMake)) return false;
    if (negated) { if (model.make) set.excludeMakes = add(set.excludeMakes, model.make); return; }
    set.models = add(set.models, model.value); if (model.make) set.makes = add(set.makes, model.make);
  });
  dictionary(vocabulary.makes, (make, negated) => { if (negated) set.excludeMakes = add(set.excludeMakes, make); else set.makes = add(set.makes, make); });
  dictionary(unsupportedNeeds, need => { set.unsupported = add(set.unsupported, need); });
  dictionary(cityGroups, (group, negated) => { if (negated) return false; set.cities = [...new Set([...(set.cities ?? []), ...group])]; });
  dictionary(vocabulary.cities, (city, negated) => { if (negated) return false; set.cities = add(set.cities, city); });
  dictionary(preferences, (preference, negated) => { if (negated) return false; parse.preferences.push(preference); });
  dictionary(conditions, value => { set.conditions = value; });
  dictionary(transmissions, (value, negated) => { set.transmission = negated ? (value === "automatic" ? "manual" : "automatic") : value; });
  const originalTokens = raw.split(/[\s,]+/);
  if (originalTokens.includes("AT") || originalTokens.includes("MT")) {
    set.transmission = originalTokens.includes("AT") ? "automatic" : "manual";
    text = text.replace(/(?<![a-z0-9])(?:at|mt)(?![a-z0-9])/g, match => originalTokens.includes(match.toUpperCase()) ? " " : match);
  }
  dictionary(fuels, (value, negated) => { if (negated) set.excludeFuels = add(set.excludeFuels, value); else set.fuels = add(set.fuels, value); });
  dictionary(bodies, (value, negated) => { if (negated) set.excludeBodies = add(set.excludeBodies, value); else set.bodies = add(set.bodies, value); });
  dictionary(colours.map(colour => ({ value: colour === "gray" ? "grey" : colour, aliases: [colour] })), (colour, negated) => { if (negated) return false; set.colours = add(set.colours, colour); });

  parse.unknown = [...new Set(words(text).filter(word => word.length > 1 && !stopwords.has(word) && !/^[\d.,+]+$/.test(word)))];
  // A guarded model said on its own ("swift", "venue") is still that model; "city" stays ambiguous.
  const alone = parse.unknown.length === 1 ? vocabulary.models.find(model => model.guarded && model.value !== "City" && model.aliases.includes(parse.unknown[0])) : undefined;
  if (alone) { set.models = add(set.models, alone.value); if (alone.make) set.makes = add(set.makes, alone.make); parse.unknown = []; }
  if (parse.sort) parse.preferences.push(({ price_asc: "value", price_desc: "premium", year_desc: "newest", km_asc: "low_km" } as const)[parse.sort]);
  return parse;
}

function mergeTurn(intent: DiscoveryIntent, parse: TurnParse, vocabulary: DiscoveryVocabulary): DiscoveryIntent {
  const next: DiscoveryIntent = parse.reset ? {} : structuredClone(intent);
  const record = next as Record<string, unknown>;
  const cleared: Record<string, (keyof DiscoveryIntent)[]> = {
    budget: ["budget"], fuels: ["fuels", "excludeFuels"], transmission: ["transmission"], bodies: ["bodies", "excludeBodies"],
    makes: ["makes", "models", "excludeMakes"], cities: ["cities", "radiusKm"], years: ["minYear", "maxYear"], maxKm: ["maxKm"],
    maxOwners: ["maxOwners"], minSeats: ["minSeats"], colours: ["colours"], conditions: ["conditions"], keywords: ["keywords"],
    preferences: ["preferences", "focus", "sort"], features: ["features"],
  };
  for (const key of parse.clear) for (const field of cleared[key] ?? []) delete next[field];
  const s = parse.set;
  if (s.budget) {
    const prior = next.budget ?? {};
    const whole = s.budget.around !== undefined || (s.budget.min !== undefined && s.budget.max !== undefined);
    const merged = whole ? { min: s.budget.min, max: s.budget.max, around: s.budget.around } : {
      min: s.budget.min ?? (s.budget.max !== undefined && prior.min !== undefined && prior.min < s.budget.max ? prior.min : undefined),
      max: s.budget.max ?? (s.budget.min !== undefined && prior.max !== undefined && prior.max > s.budget.min ? prior.max : undefined),
    };
    next.budget = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined));
  }
  for (const key of ["minYear", "maxYear", "maxKm", "maxOwners", "minSeats", "radiusKm", "transmission", "conditions"] as const) if (s[key] !== undefined) record[key] = s[key];
  if (next.minYear !== undefined && next.maxYear !== undefined && next.minYear > next.maxYear) { if (s.minYear !== undefined) delete next.maxYear; else delete next.minYear; }
  for (const key of ["cities", "bodies", "makes", "models", "fuels", "colours"] as const) if (s[key]?.length)
    record[key] = parse.additive ? [...new Set([...((next[key] ?? []) as string[]), ...(s[key] as string[])])] : [...(s[key] as string[])];
  if (s.makes?.length && !s.models?.length && !parse.additive) delete next.models;
  for (const [positive, negative] of [["fuels", "excludeFuels"], ["bodies", "excludeBodies"], ["makes", "excludeMakes"]] as const) {
    const exclude = (s[negative] ?? []) as string[];
    if (exclude.length) {
      record[negative] = [...new Set([...((next[negative] ?? []) as string[]), ...exclude])];
      if (next[positive]) record[positive] = (next[positive] as string[]).filter(value => !exclude.includes(value));
      if (positive === "makes" && next.models) next.models = next.models.filter(model => !exclude.some(make => compact(vocabulary.models.find(entry => entry.value === model)?.make ?? "") === compact(make)));
    }
    if (s[positive]?.length && next[negative]) record[negative] = (next[negative] as string[]).filter(value => !(s[positive] as string[]).includes(value));
    for (const key of [positive, negative, "models"] as const) if (Array.isArray(next[key]) && !(next[key] as string[]).length) delete next[key];
  }
  if (s.features?.length) next.features = [...new Set([...(next.features ?? []), ...s.features])];
  if (s.unsupported?.length) next.unsupported = [...new Set([...(next.unsupported ?? []), ...s.unsupported])];
  if (parse.preferences.length) {
    next.preferences = [...new Set([...(next.preferences ?? []), ...parse.preferences])];
    next.focus = parse.preferences.at(-1);
    if (!parse.sort) delete next.sort;
  }
  if (parse.sort) { next.sort = parse.sort; next.focus = parse.sort; }
  const keywords = parse.unknown.filter(word => vocabulary.tokens.has(word));
  if (keywords.length) next.keywords = [...new Set([...(next.keywords ?? []), ...keywords])];
  return next;
}

// ---------------------------------------------------------------------------------------------
// Evaluation, ranking and explanation
// ---------------------------------------------------------------------------------------------

const decimals = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });
/** Indian buyer notation: ₹8.5 lakh, ₹1.2 crore. */
export function rupees(value: number) {
  if (value >= 1e7) return `₹${decimals.format(value / 1e7)} crore`;
  if (value >= 1e5) return `₹${decimals.format(value / 1e5)} lakh`;
  return `₹${new Intl.NumberFormat("en-IN").format(value)}`;
}
const kmFormat = (value: number) => `${new Intl.NumberFormat("en-IN").format(value)} km`;
const fuelLabel = (value: DiscoveryFuel) => value === "cng" || value === "lpg" ? value.toUpperCase() : titleCase(value);
const fuelWord = (value: DiscoveryFuel) => value === "cng" || value === "lpg" ? value.toUpperCase() : value;
const preferenceLabels: Record<Preference, string> = {
  economy: "Better mileage", low_km: "Low kilometres", reliability: "Reliability", low_maintenance: "Low maintenance", family: "Family friendly",
  first_time: "First-time buyer", city: "City driving", highway: "Highway driving", premium: "Premium", value: "Best value", newest: "Newest",
};
const rankedFor: Record<Preference, string> = {
  economy: "better mileage", low_km: "low kilometres", reliability: "reliability evidence (age, kilometres, ownership and recorded condition)",
  low_maintenance: "lower upkeep evidence (age and kilometres)", family: "families", first_time: "a first-time buyer", city: "city driving",
  highway: "highway driving", premium: "a premium feel", value: "value", newest: "the newest cars",
};
const sortLabels: Record<SortOrder, string> = { price_asc: "Lowest price first", price_desc: "Highest price first", year_desc: "Newest first", km_asc: "Lowest kilometres first" };

const seatsOf = (v: DiscoveryVehicle) => {
  const entry = Object.entries(v.specifications ?? {}).find(([key]) => /^(seats?|seating(?: capacity)?|seater)$/i.test(key.trim()));
  const value = entry ? Number(String(entry[1]).match(/\d+/)?.[0]) : NaN;
  return value >= 2 && value <= 12 ? value : undefined;
};
/** Recorded fuel economy (km/l or km/kWh) when the dealer supplied one; never estimated. */
export function recordedEconomy(v: DiscoveryVehicle) {
  const entry = Object.entries(v.specifications ?? {}).find(([key]) => /fuel ?economy|mileage|efficiency|kmpl|arai/i.test(key));
  const match = entry ? String(entry[1]).match(/(\d+(?:\.\d+)?)\s*(km\s*\/\s*kwh|kmpl|km\s*\/\s*l|km per (?:litre|liter))?/i) : null;
  const value = match ? Number(match[1]) : NaN;
  return value > 0 && value < 100 ? { value, unit: /kwh/i.test(match?.[2] ?? "") ? "km/kWh" : "km/l" } : undefined;
}
const proxyEconomy: Record<string, number> = { electric: 1, hybrid: .8, cng: .7, diesel: .55, lpg: .5, petrol: .3 };

type Check = { key: string; label: string; test: (v: DiscoveryVehicle) => boolean | null };
function checks(intent: DiscoveryIntent, locations: Map<string, DiscoveryLocation>, vocabulary: DiscoveryVocabulary): Check[] {
  const list: Check[] = [];
  const known = (value: number | undefined | null): value is number => typeof value === "number" && Number.isFinite(value);
  const b = intent.budget;
  if (b?.min !== undefined || b?.max !== undefined) list.push({ key: "budget", label: "the price", test: v => known(v.price) && v.price > 0 ? (b.min === undefined || v.price >= b.min) && (b.max === undefined || v.price <= b.max) : null });
  if (intent.cities?.length) list.push({ key: "cities", label: "the location", test: v => { const city = canonicalCity(locations.get(v.locationId)?.city, vocabulary); return city ? intent.cities!.includes(city) : null; } });
  if (intent.bodies?.length || intent.excludeBodies?.length) list.push({ key: "bodies", label: "the body type", test: v => { const body = canonicalBody(v.bodyType); return body ? (!intent.bodies?.length || intent.bodies.includes(body)) && !(intent.excludeBodies ?? []).includes(body) : null; } });
  if (intent.makes?.length || intent.models?.length || intent.excludeMakes?.length) list.push({ key: "makes", label: "the make or model", test: v => {
    if (!v.make || !v.model) return null;
    return (!intent.makes?.length || intent.makes.some(make => compact(make) === compact(v.make))) &&
      (!intent.models?.length || intent.models.some(model => compact(v.model).startsWith(compact(model)))) &&
      !(intent.excludeMakes ?? []).some(make => compact(make) === compact(v.make));
  } });
  if (intent.fuels?.length || intent.excludeFuels?.length) list.push({ key: "fuels", label: "the fuel type", test: v => v.fuelType ? (!intent.fuels?.length || intent.fuels.includes(v.fuelType)) && !(intent.excludeFuels ?? []).includes(v.fuelType) : null });
  if (intent.transmission) list.push({ key: "transmission", label: "the transmission", test: v => v.transmission ? v.transmission === intent.transmission : null });
  if (intent.minYear !== undefined || intent.maxYear !== undefined) list.push({ key: "years", label: "the model year", test: v => known(v.year) && v.year > 1900 ? (intent.minYear === undefined || v.year >= intent.minYear) && (intent.maxYear === undefined || v.year <= intent.maxYear) : null });
  if (intent.maxKm !== undefined) list.push({ key: "maxKm", label: "the kilometres", test: v => known(v.mileage) && v.mileage >= 0 ? v.mileage <= intent.maxKm! : null });
  if (intent.maxOwners !== undefined) list.push({ key: "maxOwners", label: "the ownership", test: v => known(v.ownership) && v.ownership >= 1 ? v.ownership <= intent.maxOwners! : null });
  if (intent.minSeats !== undefined) list.push({ key: "minSeats", label: "the seating capacity", test: v => { const seats = seatsOf(v); return seats === undefined ? null : seats >= intent.minSeats!; } });
  if (intent.colours?.length) list.push({ key: "colours", label: "the colour", test: v => v.exteriorColor?.trim() ? intent.colours!.some(colour => v.exteriorColor.toLowerCase().includes(colour) || (colour === "grey" && v.exteriorColor.toLowerCase().includes("gray"))) : null });
  if (intent.conditions?.length) list.push({ key: "conditions", label: "the condition", test: v => v.condition ? intent.conditions!.includes(v.condition) : null });
  if (intent.keywords?.length) list.push({ key: "keywords", label: "the description", test: v => { const tokens = searchable(v); return intent.keywords!.every(word => tokens.includes(word)); } });
  return list;
}

interface Evaluation { eligible: DiscoveryVehicle[]; reserved: number; unverified: Record<string, number>; published: DiscoveryVehicle[] }
function evaluate(list: Check[], vehicles: DiscoveryVehicle[]): Evaluation {
  const published = vehicles.filter(v => v.publishStatus === "published" && v.availabilityStatus !== "sold");
  const eligible: DiscoveryVehicle[] = [], unverified: Record<string, number> = {}; let reserved = 0;
  for (const v of published) {
    const outcomes = list.map(check => ({ check, result: check.test(v) }));
    if (outcomes.some(item => item.result === false)) continue;
    const unknown = outcomes.filter(item => item.result === null);
    if (unknown.length) { if (v.availabilityStatus === "available") for (const item of unknown) unverified[item.check.label] = (unverified[item.check.label] ?? 0) + 1; continue; }
    if (v.availabilityStatus === "available") eligible.push(v); else reserved++;
  }
  return { eligible, reserved, unverified, published };
}

function rank(intent: DiscoveryIntent, vehicles: DiscoveryVehicle[]) {
  const range = (values: number[]) => { const finite = values.filter(Number.isFinite); return finite.length ? [Math.min(...finite), Math.max(...finite)] as const : [0, 0] as const; };
  const scale = (value: number, [low, high]: readonly [number, number], invert = false) => !Number.isFinite(value) ? 0 : high === low ? 1 : invert ? (high - value) / (high - low) : (value - low) / (high - low);
  const years = range(vehicles.map(v => v.year)), kms = range(vehicles.map(v => v.mileage)), prices = range(vehicles.map(v => v.price));
  const economyRange = range(vehicles.map(v => recordedEconomy(v)?.value ?? NaN));
  const condition: Record<string, number> = { excellent: 1, good: .6, fair: .2 };
  const owners = (v: DiscoveryVehicle) => v.ownership === 1 ? 1 : v.ownership === 2 ? .6 : v.ownership === 3 ? .3 : 0;
  const parts = (v: DiscoveryVehicle): Record<Preference | "quality", number> => {
    const recency = scale(v.year, years), lowKm = scale(v.mileage, kms, true), cheap = scale(v.price, prices, true), seats = seatsOf(v), body = canonicalBody(v.bodyType), economy = recordedEconomy(v);
    const featureShare = intent.features?.length ? intent.features.filter(label => features.find(entry => entry.value.label === label)?.value.test.test((v.features ?? []).join(" "))).length / intent.features.length : 0;
    return {
      quality: .3 * recency + .3 * lowKm + .2 * owners(v) + .2 * (condition[v.condition] ?? 0) + .5 * featureShare,
      economy: economy ? .5 + .5 * scale(economy.value, economyRange) : proxyEconomy[v.fuelType] ?? 0, low_km: lowKm, newest: recency, value: cheap, premium: 1 - cheap,
      reliability: (recency + lowKm + owners(v) + (condition[v.condition] ?? 0)) / 4,
      low_maintenance: (recency + lowKm + (v.fuelType === "electric" ? 1 : .5)) / 3,
      family: (seats === undefined ? .3 : seats >= 7 ? 1 : seats >= 6 ? .8 : seats >= 5 ? .6 : 0) * .6 + (body === "suv" || body === "muv" ? .4 : body === "sedan" || body === "wagon" ? .25 : 0),
      first_time: (cheap + recency + owners(v)) / 3 * .8 + (body === "hatchback" || body === "sedan" ? .2 : body === "suv" ? .1 : 0),
      city: (v.transmission === "automatic" ? .5 : .1) + (body === "hatchback" ? .5 : body === "sedan" ? .35 : body === "suv" ? .25 : .1),
      highway: (["diesel", "hybrid"].includes(v.fuelType) ? .5 : v.fuelType === "electric" ? .2 : .3) + (body === "suv" || body === "sedan" || body === "muv" ? .5 : .2),
    };
  };
  const sortValue: Record<SortOrder, (v: DiscoveryVehicle) => number> = { price_asc: v => v.price, price_desc: v => -v.price, year_desc: v => -v.year, km_asc: v => v.mileage };
  const scored = vehicles.map(v => {
    const p = parts(v);
    const score = p.quality + (intent.preferences ?? []).reduce((sum, pref) => sum + p[pref] * (intent.focus === pref ? 2.5 : 1), 0);
    return { v, score: Math.round(score * 1000) / 1000 };
  });
  scored.sort((a, b) => (intent.sort ? sortValue[intent.sort](a.v) - sortValue[intent.sort](b.v) : 0) || b.score - a.score || a.v.price - b.v.price || a.v.id.localeCompare(b.v.id));
  return { scored, prices, kms, years };
}

function explain(v: DiscoveryVehicle, intent: DiscoveryIntent, context: ReturnType<typeof rank>, locations: Map<string, DiscoveryLocation>, vocabulary: DiscoveryVocabulary): Omit<DiscoveryMatch, "vehicleId" | "rank"> {
  const requirements: string[] = [], names: string[] = [], strengths: string[] = [], caveats: string[] = [];
  const city = canonicalCity(locations.get(v.locationId)?.city, vocabulary), body = canonicalBody(v.bodyType), seats = seatsOf(v), economy = recordedEconomy(v);
  const prefs = new Set(intent.preferences ?? []);
  const need = (label: string, name: string) => { requirements.push(label); names.push(name); };
  if (intent.models?.length || intent.makes?.length) need(`${v.make} ${v.model}`, intent.models?.length ? "model" : "make");
  if (intent.bodies?.length && body) need(bodyLabels[body][0], bodyLabels[body][0]);
  if (intent.fuels?.length) need(fuelLabel(v.fuelType), fuelWord(v.fuelType));
  if (intent.transmission) need(titleCase(v.transmission), v.transmission);
  const b = intent.budget;
  if (b?.around !== undefined) need(`Near your ${rupees(b.around)} budget`, "budget");
  else if (b?.min !== undefined && b?.max !== undefined) need(`In your ${rupees(b.min)}–${rupees(b.max)} range`, "budget");
  else if (b?.max !== undefined) need(`Within your ${rupees(b.max)} budget`, "budget");
  else if (b?.min !== undefined) need(`Above ${rupees(b.min)}`, "budget");
  if (intent.cities?.length && city) need(`In ${city}`, "location");
  if (intent.minYear !== undefined || intent.maxYear !== undefined) need(`${v.year} model`, "model-year");
  if (intent.maxKm !== undefined) need(`${kmFormat(v.mileage)} (under ${kmFormat(intent.maxKm)})`, "kilometre");
  if (intent.maxOwners !== undefined) need(v.ownership === 1 ? "First owner" : `${v.ownership} owners`, "ownership");
  if (intent.minSeats !== undefined && seats) need(`${seats} seats`, "seating");
  if (intent.colours?.length) need(v.exteriorColor, "colour");
  if (intent.conditions?.length) need(`Condition: ${v.condition} (dealer-reported)`, "condition");
  for (const word of intent.keywords ?? []) need(`Matches “${word}”`, `“${word}”`);

  const third = (value: number, [low, high]: readonly [number, number], lowIsGood: boolean) => high === low ? true : lowIsGood ? value <= low + (high - low) / 3 : value >= high - (high - low) / 3;
  if (prefs.has("economy")) {
    if (economy) strengths.push(`${economy.value} ${economy.unit} recorded by the dealer`);
    else { if (["electric", "hybrid", "cng"].includes(v.fuelType)) strengths.push(`${fuelLabel(v.fuelType)} — usually lower running costs than petrol`); caveats.push("Fuel economy isn't recorded — confirm it with the dealer."); }
  }
  if ((prefs.has("low_km") || prefs.has("reliability") || prefs.has("low_maintenance")) && third(v.mileage, context.kms, true)) strengths.push(`Among the lowest kilometres here (${kmFormat(v.mileage)})`);
  if ((prefs.has("newest") || prefs.has("reliability") || prefs.has("low_maintenance")) && third(v.year, context.years, false)) strengths.push(`One of the newest here (${v.year})`);
  if (prefs.has("reliability") || prefs.has("low_maintenance")) {
    if (v.ownership === 1) strengths.push("First owner");
    caveats.push(prefs.has("reliability") ? "Reliability isn't measured — ask for service records and an inspection." : "Maintenance costs aren't recorded — ask the dealer for service history.");
  }
  if (prefs.has("family")) { if (seats) strengths.push(`${seats} seats recorded`); else caveats.push("Seating capacity isn't recorded — confirm it with the dealer."); if (body === "suv" || body === "muv") strengths.push(`${bodyLabels[body][0]} body style`); }
  if ((prefs.has("value") || prefs.has("first_time")) && third(v.price, context.prices, true)) strengths.push("Among the most affordable matches");
  if (prefs.has("premium") && third(v.price, context.prices, false)) strengths.push("Among the most premium matches");
  if (prefs.has("city") && v.transmission === "automatic") strengths.push("Automatic — easier in stop-start traffic");
  if (prefs.has("highway") && ["diesel", "hybrid"].includes(v.fuelType)) strengths.push(`${fuelLabel(v.fuelType)} — suited to long distances`);
  for (const label of intent.features ?? []) {
    const listed = features.find(entry => entry.value.label === label)?.value.test.test((v.features ?? []).join(" "));
    if (listed) strengths.push(`Lists ${label.toLowerCase()}`); else caveats.push(`${label} isn't listed — ask the dealer.`);
  }
  if (!strengths.length && !requirements.length) {
    if (v.ownership === 1) strengths.push("First owner");
    if (third(v.mileage, context.kms, true)) strengths.push(`Low kilometres (${kmFormat(v.mileage)})`);
  }
  const unique = (list: string[]) => [...new Set(list)];
  const r = unique(requirements), n = unique(names), s = unique(strengths).slice(0, 4), c = unique(caveats).slice(0, 3);
  const listed = n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : n[0];
  const opening = n.length ? `Matches your ${listed}${n.length === 1 && ["budget", "location"].includes(n[0]) ? "" : n.length === 1 ? " requirement" : " requirements"}.` : s.length ? `${s.slice(0, 2).join(" · ")}.` : `Available now${city ? ` in ${city}` : ""}.`;
  const summary = [opening, n.length && s.length ? `${s[0]}.` : "", c[0] ?? ""].filter(Boolean).join(" ");
  return { summary, requirements: r, strengths: s, caveats: c };
}

function describe(intent: DiscoveryIntent, count: number) {
  const model = intent.models?.length === 1 ? `${intent.makes?.length === 1 ? intent.makes[0] + " " : ""}${intent.models[0]}` : undefined;
  const body = model ? (count === 1 ? "listing" : "listings") : intent.bodies?.length === 1 ? bodyLabels[intent.bodies[0]][count === 1 ? 0 : 1] : count === 1 ? "car" : "cars";
  const terms = [intent.transmission, intent.fuels?.length === 1 ? fuelWord(intent.fuels[0]) : undefined, model ?? (intent.makes?.length === 1 ? intent.makes[0] : undefined), body].filter(Boolean).join(" ");
  const b = intent.budget;
  const money = b?.around !== undefined ? ` around ${rupees(b.around)}` : b?.min !== undefined && b?.max !== undefined ? ` between ${rupees(b.min)} and ${rupees(b.max)}` : b?.max !== undefined ? ` under ${rupees(b.max)}` : b?.min !== undefined ? ` above ${rupees(b.min)}` : "";
  const place = intent.cities?.length ? ` in ${intent.cities.length > 2 ? `${intent.cities[0]} and nearby` : intent.cities.join(" or ")}` : "";
  return `${terms}${money}${place}`;
}

/** Chips summarise what was understood. Each removal is itself a follow-up turn, so history stays honest. */
export function discoveryChips(intent: DiscoveryIntent): DiscoveryChip[] {
  const chips: DiscoveryChip[] = [], b = intent.budget;
  const chip = (key: string, label: string, remove: string, kind: DiscoveryChip["kind"] = "requirement") => chips.push({ key, label, kind, remove });
  if (b?.around !== undefined) chip("budget", `Around ${rupees(b.around)}`, "any budget");
  else if (b?.min !== undefined && b?.max !== undefined) chip("budget", `${rupees(b.min)}–${rupees(b.max)}`, "any budget");
  else if (b?.max !== undefined) chip("budget", `Up to ${rupees(b.max)}`, "any budget");
  else if (b?.min !== undefined) chip("budget", `From ${rupees(b.min)}`, "any budget");
  if (intent.models?.length) chip("makes", intent.models.map(model => intent.makes?.length === 1 ? `${intent.makes[0]} ${model}` : model).join(" or "), "any brand");
  else if (intent.makes?.length) chip("makes", intent.makes.join(" or "), "any brand");
  if (intent.excludeMakes?.length) chip("makes", `Not ${intent.excludeMakes.join(" or ")}`, "any brand");
  if (intent.bodies?.length) chip("bodies", intent.bodies.map(body => bodyLabels[body][0]).join(" or "), "any body type");
  if (intent.excludeBodies?.length) chip("bodies", `Not ${intent.excludeBodies.map(body => bodyLabels[body][0]).join(" or ")}`, "any body type");
  if (intent.fuels?.length) chip("fuels", intent.fuels.map(fuelLabel).join(" or "), "any fuel");
  if (intent.excludeFuels?.length) chip("fuels", `Not ${intent.excludeFuels.map(fuelLabel).join(" or ")}`, "any fuel");
  if (intent.transmission) chip("transmission", titleCase(intent.transmission), "any transmission");
  if (intent.cities?.length) chip("cities", intent.cities.length > 2 ? `${intent.cities[0]} area` : intent.cities.join(" or "), "any city");
  if (intent.minYear !== undefined && intent.maxYear !== undefined) chip("years", intent.minYear === intent.maxYear ? `${intent.minYear} model` : `${intent.minYear}–${intent.maxYear}`, "any year");
  else if (intent.minYear !== undefined) chip("years", `${intent.minYear} or newer`, "any year");
  else if (intent.maxYear !== undefined) chip("years", `${intent.maxYear} or older`, "any year");
  if (intent.maxKm !== undefined) chip("maxKm", `Under ${kmFormat(intent.maxKm)}`, "any kilometres");
  if (intent.maxOwners !== undefined) chip("maxOwners", intent.maxOwners === 1 ? "First owner" : `Up to ${intent.maxOwners} owners`, "any owners");
  if (intent.minSeats !== undefined) chip("minSeats", `${intent.minSeats}+ seats`, "any seats");
  if (intent.colours?.length) chip("colours", intent.colours.map(titleCase).join(" or "), "any colour");
  if (intent.conditions?.length) chip("conditions", intent.conditions.length === 1 ? "Excellent condition" : "Good condition or better", "any condition");
  if (intent.keywords?.length) chip("keywords", intent.keywords.map(word => `“${word}”`).join(" "), "clear keywords");
  if (intent.sort) chip("sort", sortLabels[intent.sort], "clear preferences", "preference");
  const implied: Record<SortOrder, Preference> = { price_asc: "value", price_desc: "premium", year_desc: "newest", km_asc: "low_km" };
  for (const pref of intent.preferences ?? []) if (!intent.sort || implied[intent.sort] !== pref) chip(`pref:${pref}`, preferenceLabels[pref], "clear preferences", "preference");
  for (const label of intent.features ?? []) chip(`feature:${label}`, label, "any features", "preference");
  if (intent.radiusKm !== undefined) chip("radius", `Within ${intent.radiusKm} km (not supported)`, "any city", "unsupported");
  return chips;
}

interface Session { intent: DiscoveryIntent; list: Check[]; evaluation: Evaluation; notes: DiscoveryNotice[]; unknown: string[]; thread: DiscoveryResult["thread"] }
function converse(turns: string[], vehicles: DiscoveryVehicle[], locationList: DiscoveryLocation[], now: Date, vocabulary: DiscoveryVocabulary): Session {
  const locations = new Map(locationList.map(location => [location.id, location]));
  const thread: DiscoveryResult["thread"] = [];
  let intent: DiscoveryIntent = {}, notes: DiscoveryNotice[] = [], unknown: string[] = [];
  for (const turn of turns) {
    const parse = parseTurn(turn, vocabulary, now.getUTCFullYear(), intent);
    intent = mergeTurn(intent, parse, vocabulary);
    notes = [...(parse.reset ? [] : notes), ...parse.notes];
    unknown = parse.unknown.filter(word => !vocabulary.tokens.has(word));
    const list = checks(intent, locations, vocabulary);
    thread.push({ turn, reply: replyFor(intent, list, evaluate(list, vehicles), vehicles, unknown, parse.reset) });
  }
  const list = checks(intent, locations, vocabulary);
  return { intent, list, evaluation: evaluate(list, vehicles), notes, unknown, thread };
}

/** Runs a whole conversation. Each turn refines the previous intent; nothing is broadened silently. */
export function discover(input: { turns: unknown; vehicles: DiscoveryVehicle[]; locations: DiscoveryLocation[]; now?: Date; cursor?: number; limit?: number }): DiscoveryResult {
  const turns = sanitizeTurns(input.turns), now = input.now ?? new Date();
  const vocabulary = discoveryVocabulary(input.vehicles, input.locations);
  const locations = new Map(input.locations.map(location => [location.id, location]));
  const { intent, list, evaluation, notes, unknown, thread } = converse(turns, input.vehicles, input.locations, now, vocabulary);
  const ranked = rank(intent, evaluation.eligible);
  const limit = Math.min(Math.max(Math.trunc(Number(input.limit) || discoveryLimits.page), 1), discoveryLimits.maxPage);
  const cursor = Math.min(Math.max(Math.trunc(Number(input.cursor) || 0), 0), ranked.scored.length);
  const results = ranked.scored.slice(cursor, cursor + limit).map((item, index) => ({ vehicleId: item.v.id, rank: cursor + index + 1, ...explain(item.v, intent, ranked, locations, vocabulary) }));
  const notices: DiscoveryNotice[] = [...notes];
  for (const need of intent.unsupported ?? []) notices.push({ kind: "unsupported", text: unsupportedText[need] });
  if (intent.radiusKm !== undefined) notices.push({ kind: "unsupported", text: unsupportedText.radius });
  if (intent.fuels?.some(fuel => fuel === "cng" || fuel === "lpg")) notices.push({ kind: "unsupported", text: "CNG and LPG fittings aren't recorded in these listings, so those cars can't be identified." });
  if ((intent.preferences ?? []).includes("economy") && evaluation.eligible.some(v => !recordedEconomy(v))) notices.push({ kind: "unsupported", text: "Fuel-economy figures aren't recorded for every car, so mileage is ranked by fuel type as a guide (electric, hybrid, then diesel and petrol). Confirm real figures with the dealer." });
  if ((intent.preferences ?? []).some(pref => pref === "reliability" || pref === "low_maintenance")) notices.push({ kind: "unsupported", text: "Reliability and running costs aren't measured directly. Ranking uses model year, kilometres, ownership and the dealer's recorded condition." });
  for (const [label, count] of Object.entries(evaluation.unverified)) notices.push({ kind: "unverified", text: `${count} more ${count === 1 ? "car is" : "cars are"} hidden because ${label} isn't recorded, so your requirement can't be confirmed.` });
  if (evaluation.reserved) notices.push({ kind: "reserved", text: `${evaluation.reserved} reserved ${evaluation.reserved === 1 ? "car also matches" : "cars also match"}. Ask the dealer whether ${evaluation.reserved === 1 ? "it becomes" : "they become"} available.` });
  if (unknown.length) notices.push({ kind: "unrecognised", text: `I didn't recognise “${unknown.slice(0, 4).join(" ")}”, so it wasn't used as a filter.` });
  const served = [...new Set(evaluation.published.map(v => canonicalCity(locations.get(v.locationId)?.city, vocabulary)).filter((city): city is string => Boolean(city)))];
  if (intent.cities?.length && !intent.cities.some(city => served.includes(city)) && served.length) notices.push({ kind: "location", text: `Cars here are listed in ${served.join(" and ")}. Nothing is listed in ${intent.cities.length > 2 ? `the ${intent.cities[0]} area` : intent.cities.join(" or ")} yet.` });
  if (turns.length >= discoveryLimits.turns) notices.push({ kind: "limit", text: "That's the most refinements one search can hold. Start a new search to keep going." });
  return {
    version: discoveryVersion, turns, intent, chips: discoveryChips(intent), thread,
    reply: thread.at(-1)?.reply ?? openingReply(evaluation.eligible.length),
    notices, suggestions: suggestionsFor(intent, list, evaluation, input.vehicles),
    total: ranked.scored.length, reserved: evaluation.reserved, results, cursor, nextCursor: cursor + limit < ranked.scored.length ? cursor + limit : null,
  };
}

/** Server-side context for an enquiry: where this car ranked for the buyer's own words. */
export function discoveryContext(input: { turns: unknown; vehicleId?: string; vehicles: DiscoveryVehicle[]; locations: DiscoveryLocation[]; now?: Date }) {
  const turns = sanitizeTurns(input.turns); if (!turns.length) return undefined;
  const vocabulary = discoveryVocabulary(input.vehicles, input.locations);
  const { intent, evaluation } = converse(turns, input.vehicles, input.locations, input.now ?? new Date(), vocabulary);
  const ranked = rank(intent, evaluation.eligible);
  const index = input.vehicleId ? ranked.scored.findIndex(item => item.v.id === input.vehicleId) : -1;
  const match = index >= 0 ? explain(ranked.scored[index].v, intent, ranked, new Map(input.locations.map(location => [location.id, location])), vocabulary) : undefined;
  return {
    engine: discoveryVersion, query: turns[0], refinements: turns.slice(1),
    requirements: discoveryChips(intent).map(chip => chip.label).slice(0, 16),
    rank: index >= 0 ? index + 1 : undefined, total: ranked.scored.length, summary: match?.summary,
  };
}

const openingReply = (count: number) => count ? `Here ${count === 1 ? "is the 1 car" : `are all ${count} cars`} available right now. Tell me what you need — budget, body type, fuel, city — and I'll narrow it down.` : "No cars are listed right now. Please check back soon.";

function replyFor(intent: DiscoveryIntent, list: Check[], step: Evaluation, vehicles: DiscoveryVehicle[], unknown: string[], reset: boolean) {
  const count = step.eligible.length, lead = reset ? "Starting fresh. " : "";
  const focus = intent.focus;
  const reason = !focus ? "" : focus in sortLabels ? ` Sorted ${sortLabels[focus as SortOrder].toLowerCase()}.` : ` Ranked for ${rankedFor[focus as Preference]}.`;
  if (!list.length) {
    if (!(intent.preferences ?? []).length && !intent.sort) return lead + (unknown.length ? `I couldn't match “${unknown.slice(0, 4).join(" ")}” to a make, model or feature. ` : "") + openingReply(count);
    if (!count) return `${lead}No cars are listed right now.`;
    return `${lead}Here ${count === 1 ? "is the 1 available car" : `are all ${count} available cars`}.${reason} Top match: ${carName(rank(intent, step.eligible).scored[0].v)}.`;
  }
  if (!count) {
    const reasons = blockers(intent, list, vehicles).slice(0, 2).map(item => item.reason).filter(Boolean);
    return `${lead}No available ${describe(intent, 2).trim() || "cars"} match all of that right now.${reasons.length ? " " + reasons.join(" ") : ""}`;
  }
  return `${lead}Found ${count} ${describe(intent, count).trim()}.${reason} Top match: ${carName(rank(intent, step.eligible).scored[0].v)}.`;
}
const carName = (v: DiscoveryVehicle) => `${v.year} ${v.make} ${v.model}`;

function blockers(intent: DiscoveryIntent, list: Check[], vehicles: DiscoveryVehicle[]) {
  const keys = [...new Set(list.map(check => check.key))];
  const without = (drop: string[]) => evaluate(list.filter(check => !drop.includes(check.key)), vehicles).eligible;
  // Requirements nothing in stock can meet on their own; the price guidance ignores them.
  const absolute = keys.filter(key => !evaluate(list.filter(check => check.key === key), vehicles).eligible.length);
  return keys.map(key => {
    const alone = evaluate(list.filter(check => check.key === key), vehicles).eligible;
    const relaxed = without([key]);
    // The closest price must come from cars that meet the buyer's other requirements, never just any car.
    const priced = key === "budget" ? (relaxed.length ? relaxed : without(["budget", ...absolute])) : [];
    const cheapest = priced.filter(v => v.price > 0).sort((a, b) => a.price - b.price)[0];
    const others = list.some(check => check.key !== "budget" && !absolute.includes(check.key));
    const label = list.find(check => check.key === key)?.label ?? key;
    let reason = "";
    if (!alone.length) reason = key === "budget" && cheapest ? `${others ? "Cars meeting your other requirements start at" : "Prices here start at"} ${rupees(cheapest.price)}, so nothing fits that budget. I won't change your budget unless you ask.`
      : key === "cities" ? `Nothing is listed in ${intent.cities!.length > 2 ? `the ${intent.cities![0]} area` : intent.cities!.join(" or ")} yet. I won't widen the location unless you ask.`
      : `Nothing listed here matches ${label}.`;
    else if (relaxed.length) reason = key === "budget" && cheapest ? `The closest fit is ${rupees(cheapest.price)} (${carName(cheapest)}). I won't change your budget unless you ask.`
      : `Without ${label} requirement, ${relaxed.length} would match.`;
    return { key, alone: alone.length, count: relaxed.length, cheapest, reason };
  }).sort((a, b) => Number(a.alone > 0) - Number(b.alone > 0) || b.count - a.count);
}

function suggestionsFor(intent: DiscoveryIntent, list: Check[], evaluation: Evaluation, vehicles: DiscoveryVehicle[]): DiscoverySuggestion[] {
  const suggestions: DiscoverySuggestion[] = [];
  if (!evaluation.eligible.length) {
    const chips = discoveryChips(intent);
    for (const blocker of blockers(intent, list, vehicles).slice(0, 3)) {
      if (blocker.key === "budget" && blocker.cheapest) { const lakh = Math.ceil(blocker.cheapest.price / 1e5); suggestions.push({ label: `Up to ${rupees(lakh * 1e5)}`, turn: `under ${lakh} lakh` }); continue; }
      const remove = chips.find(chip => chip.key === blocker.key)?.remove;
      if (remove && blocker.count) suggestions.push({ label: `${remove[0].toUpperCase()}${remove.slice(1)} (${blocker.count})`, turn: remove });
    }
    if (list.length) suggestions.push({ label: "Start over", turn: "start over" });
    return suggestions;
  }
  const pool = evaluation.eligible, prefs = intent.preferences ?? [];
  const split = (test: (v: DiscoveryVehicle) => boolean) => { const n = pool.filter(test).length; return n > 0 && n < pool.length; };
  if (!intent.transmission && split(v => v.transmission === "automatic")) suggestions.push({ label: "Only automatic", turn: "only automatic" });
  if (!prefs.includes("economy")) suggestions.push({ label: "Better mileage", turn: "show better mileage" });
  if (!intent.bodies?.length && split(v => canonicalBody(v.bodyType) === "suv")) suggestions.push({ label: "Only SUVs", turn: "only SUVs" });
  if (intent.maxOwners === undefined && split(v => v.ownership === 1)) suggestions.push({ label: "First owner", turn: "first owner" });
  const prices = pool.map(v => v.price).filter(price => price > 0).sort((a, b) => a - b);
  if (prices.length > 3) { const median = Math.ceil(prices[Math.floor(prices.length / 2)] / 1e5); if (median * 1e5 < prices.at(-1)!) suggestions.push({ label: `Under ${rupees(median * 1e5)}`, turn: `under ${median} lakh` }); }
  if (intent.sort !== "year_desc") suggestions.push({ label: "Newest first", turn: "newest first" });
  if (!prefs.includes("family")) suggestions.push({ label: "For a family", turn: "good for a family" });
  return suggestions.slice(0, 5);
}
