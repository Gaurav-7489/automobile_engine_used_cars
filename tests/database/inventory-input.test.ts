import { test } from "node:test";
import assert from "node:assert/strict";
import { inventoryColumns, normalizeInventoryRows, parseInventoryCsv } from "../../packages/data/src/inventory-input";
import { InventoryValidationError } from "../../packages/data/src/errors";
const row={stockId:"stock-1",make:"Honda",model:"City",variant:"ZX",year:2022,price:1200000,mileage:25000,fuelType:"petrol",transmission:"automatic",ownership:1,bodyType:"Sedan",condition:"good",exteriorColor:"White",interiorColor:"Black",imageUrl:"",financeEligible:false,exchangeEligible:true};
test("CSV preserves quoted commas, quotes, newlines and BOM with row validation",()=> {
  const quoted=(v:unknown)=>`"${String(v).replaceAll('"','""')}"`;
  const csv="\uFEFF"+inventoryColumns.join(",")+"\r\n"+inventoryColumns.map(k=>quoted({...row,variant:'ZX, "Premium"\nEdition'}[k])).join(",")+"\r\n";
  const vehicles=normalizeInventoryRows(parseInventoryCsv(csv),true);
  assert.equal(vehicles[0].variant,'ZX, "Premium"\nEdition');assert.equal(vehicles[0].stockId,"STOCK-1");assert.equal(vehicles[0].publishStatus,"draft");assert.equal(vehicles[0].exchangeEligible,true);
  for(const invalid of ["",csv+'"unclosed',csv.replace("stockId,make","stockId,stockId"),csv.replace("stockId,make","unknown,make"),csv+"too,few,columns", "a".repeat(250001)])assert.throws(()=>parseInventoryCsv(invalid),InventoryValidationError);
});
test("inventory rejects protected fields, numeric coercion, unsafe media and duplicate identities",()=> {
  for(const patch of [{tenantId:"forged"},{id:"forged"},{publishStatus:"published"},{price:true},{price:"1200000"},{price:1.111},{price:0},{year:1899},{mileage:-1},{ownership:0},{fuelType:"gas"},{financeEligible:"true"},{imageUrl:"javascript:alert(1)"},{imageUrl:"https://user:password@example.com/car.jpg"}])assert.throws(()=>normalizeInventoryRows([{...row,...patch}]),InventoryValidationError);
  assert.throws(()=>normalizeInventoryRows([row,{...row,stockId:"STOCK-1"}]),InventoryValidationError);
  assert.throws(()=>normalizeInventoryRows(Array(201).fill(row)),InventoryValidationError);
  try{normalizeInventoryRows([{...row,price:-1},{...row,year:1800}],true);assert.fail();}catch(e){assert.ok(e instanceof InventoryValidationError);assert.deepEqual(e.issues.map(i=>i.row),[2,3]);}
  const vehicle=normalizeInventoryRows([row])[0];assert.equal(vehicle.source,"manual");assert.equal(vehicle.media.length,0);assert.equal(vehicle.price,1200000);
});
