export const dealerPlans = [
  { id: "starter", name: "Starter", description: "For an independent dealer", features: ["Local single-car acquisition", "Budget and landed-cost comparison", "Recommendation explanations"] },
  { id: "growth", name: "Growth", description: "For a growing dealership", features: ["Everything in Starter", "One-car and two-car portfolios", "Cross-city sourcing comparisons"] },
  { id: "scale", name: "Scale", description: "For dealership groups", features: ["Everything in Growth", "Multi-location planning", "Team and integration access (planned)"] },
] as const;
export type DealerPlan = typeof dealerPlans[number]["id"];
export type Opportunity = { id: string; model: string; city: string; purchase: number; preparation: number; transport: number; resale: number; demand: number };
// Fictional sourcing examples, never derived from retail inventory asking prices.
export const demoOpportunities: Opportunity[] = [
  { id: "demo-swift", model: "2021 Maruti Swift", city: "Kochi", purchase: 400000, preparation: 20000, transport: 5000, resale: 485000, demand: 82 },
  { id: "demo-i20", model: "2020 Hyundai i20", city: "Kochi", purchase: 450000, preparation: 25000, transport: 5000, resale: 545000, demand: 76 },
  { id: "demo-baleno", model: "2021 Maruti Baleno", city: "Bengaluru", purchase: 480000, preparation: 20000, transport: 15000, resale: 575000, demand: 85 },
  { id: "demo-creta", model: "2020 Hyundai Creta", city: "Kochi", purchase: 850000, preparation: 35000, transport: 5000, resale: 995000, demand: 88 },
  { id: "demo-city", model: "2019 Honda City", city: "Bengaluru", purchase: 620000, preparation: 30000, transport: 15000, resale: 735000, demand: 70 },
];
export function acquisitionOptions(input: { budget: number; reserve: number; city: string; plan: DealerPlan; count: 1 | 2; goal: "margin" | "demand" }, opportunities: Opportunity[]) {
  if (![input.budget, input.reserve].every(n => Number.isSafeInteger(n) && n >= 0) || input.budget === 0 || input.reserve > input.budget) throw new Error("Enter a positive whole-rupee budget and a reserve within that budget.");
  if (!dealerPlans.some(p => p.id === input.plan) || ![1, 2].includes(input.count) || !["margin", "demand"].includes(input.goal) || !input.city.trim()) throw new Error("Choose valid planning options.");
  if (input.plan === "starter" && input.count === 2) return [];
  const seen = new Set<string>();
  const eligible = opportunities.filter(o => {
    const valid = !seen.has(o.id) && [o.purchase, o.preparation, o.transport, o.resale].every(n => Number.isSafeInteger(n) && n >= 0) && o.purchase > 0 && Number.isFinite(o.demand) && o.demand >= 0 && o.demand <= 100;
    seen.add(o.id);
    return valid && (input.plan !== "starter" || o.city === input.city);
  });
  const groups = input.count === 1 ? eligible.map(o => [o]) : eligible.flatMap((o, i) => eligible.slice(i + 1).map(other => [o, other]));
  return groups.map(cars => {
    const landedCost = cars.reduce((sum, o) => sum + o.purchase + o.preparation + o.transport, 0);
    const resale = cars.reduce((sum, o) => sum + o.resale, 0);
    return { cars, landedCost, margin: resale - landedCost, unallocated: input.budget - input.reserve - landedCost, demand: cars.reduce((sum, o) => sum + o.demand, 0) / cars.length };
  }).filter(o => Number.isSafeInteger(o.landedCost) && Number.isSafeInteger(o.margin) && o.unallocated >= 0)
    .sort((a, b) => input.goal === "margin" ? b.margin - a.margin || b.demand - a.demand : b.demand - a.demand || b.margin - a.margin);
}
