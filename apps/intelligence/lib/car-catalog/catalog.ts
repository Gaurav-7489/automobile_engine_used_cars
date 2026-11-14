import { CATALOG_TEXT } from "./data";

/** Parsed car catalogue: brand → model → variants, all in display order (brands and models alphabetical). */
export type Catalog = { brands: string[]; models: Record<string, string[]>; variants: Record<string, Record<string, string[]>> };

function parse(): Catalog {
  const models: Catalog["models"] = {};
  const variants: Catalog["variants"] = {};
  for (const [brand, text] of Object.entries(CATALOG_TEXT)) {
    const byModel: Record<string, string[]> = {};
    for (const line of text.split("\n")) {
      const at = line.indexOf(":");
      if (at < 1) continue;
      const model = line.slice(0, at).trim();
      byModel[model] = line.slice(at + 1).split("|").map((v) => v.trim()).filter(Boolean);
    }
    models[brand] = Object.keys(byModel).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    variants[brand] = byModel;
  }
  return { brands: Object.keys(models).sort((a, b) => a.localeCompare(b)), models, variants };
}

export const CATALOG: Catalog = parse();

const key = (s: string) => s.trim().toLowerCase().replace(/[\s-]+/g, " ");
const find = (list: readonly string[], value: string) => list.find((x) => key(x) === key(value));

/** The catalogue's spelling of a brand, so "maruti suzuki" and "Maruti Suzuki" are one brand. Unknown brands stay as typed. */
export const canonicalBrand = (value: string) => find(CATALOG.brands, value) ?? value.trim();
export const modelsOf = (brand: string): string[] => CATALOG.models[canonicalBrand(brand)] ?? [];
export const canonicalModel = (brand: string, value: string) => find(modelsOf(brand), value) ?? value.trim();
export const variantsOf = (brand: string, model: string): string[] => {
  const b = canonicalBrand(brand);
  return CATALOG.variants[b]?.[canonicalModel(b, model)] ?? [];
};
export const canonicalVariant = (brand: string, model: string, value: string) => find(variantsOf(brand, model), value) ?? value.trim();
