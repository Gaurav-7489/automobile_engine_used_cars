import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG, canonicalBrand, canonicalModel, canonicalVariant, modelsOf, variantsOf } from "../../apps/intelligence/lib/car-catalog/catalog";

test("the catalogue covers the Indian market: mass, luxury and discontinued brands, with models and variants", () => {
  for (const brand of ["Maruti Suzuki", "Hyundai", "Tata", "Mahindra", "Kia", "Toyota", "Honda", "MG", "Skoda", "Volkswagen", "Renault", "Nissan", "Ford", "Chevrolet", "Mercedes-Benz", "BMW", "Audi", "Land Rover", "Porsche", "BYD"]) {
    assert.ok(CATALOG.brands.includes(brand), brand);
    assert.ok(modelsOf(brand).length > 0, `${brand} has models`);
  }
  assert.ok(CATALOG.brands.length >= 40);
  assert.ok(modelsOf("Hyundai").includes("Creta"));
  assert.ok(variantsOf("Hyundai", "Creta").includes("SX (O)"));
  assert.ok(variantsOf("Maruti Suzuki", "Swift").includes("ZXi Plus"));
  assert.deepEqual([...CATALOG.brands].sort((a, b) => a.localeCompare(b)), CATALOG.brands, "brands are alphabetical");
});

test("no brand has duplicate models and no model has duplicate variants", () => {
  for (const brand of CATALOG.brands) {
    const models = modelsOf(brand);
    assert.equal(new Set(models).size, models.length, brand);
    for (const model of models) {
      const variants = variantsOf(brand, model);
      assert.equal(new Set(variants).size, variants.length, `${brand} ${model}`);
    }
  }
});

test("typed values are matched to the catalogue's spelling, and unknown cars are kept as typed", () => {
  assert.equal(canonicalBrand("maruti  suzuki"), "Maruti Suzuki");
  assert.equal(canonicalBrand("mercedes benz"), "Mercedes-Benz");
  assert.equal(canonicalModel("hyundai", "grand i10 nios"), "Grand i10 Nios");
  assert.equal(canonicalVariant("Hyundai", "Creta", "sx (o)"), "SX (O)");
  assert.equal(canonicalBrand("Ambassador Classic Custom"), "Ambassador Classic Custom");
  assert.deepEqual(modelsOf("Unknown Motors"), []);
});
