import { test } from "node:test";
import assert from "node:assert/strict";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { inventoryXlsxTemplate } from "../../packages/data/src/inventory-template";
import { parseInventoryXlsx } from "../../packages/data/src/inventory-spreadsheet";
import { inventoryColumns, normalizeInventoryRows } from "../../packages/data/src/inventory-input";
import { InventoryValidationError } from "../../packages/data/src/errors";
const row = { stockId: "001-HONDA", make: "Honda", model: "City", variant: 'ZX, "Premium" & 日本', year: 2022, price: 1200000.25, mileage: 25000, fuelType: "petrol", transmission: "automatic", ownership: 1, bodyType: "Sedan", condition: "good", exteriorColor: "White", interiorColor: "Black", imageUrl: "", financeEligible: false, exchangeEligible: true };
const escape = (v: unknown) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
function dataRow(values: typeof row, index = 2): string {
  return `<row r="${index}">${inventoryColumns.map((key, i) => {
    const v = values[key], address = `${String.fromCharCode(65 + i)}${index}`;
    return typeof v === "number" ? `<c r="${address}"><v>${v}</v></c>` : typeof v === "boolean" ? `<c r="${address}" t="b"><v>${v ? 1 : 0}</v></c>` : `<c r="${address}" t="inlineStr"><is><t>${escape(v)}</t></is></c>`;
  }).join("")}</row>`;
}
function workbook(edit?: (parts: Record<string, Uint8Array>) => void, rows = dataRow(row)): string {
  const parts = unzipSync(inventoryXlsxTemplate());
  const path = "xl/worksheets/sheet1.xml";
  parts[path] = strToU8(strFromU8(parts[path]).replace("</sheetData>", rows + "</sheetData>"));
  edit?.(parts);
  return Buffer.from(zipSync(parts)).toString("base64");
}
const editXml = (parts: Record<string, Uint8Array>, path: string, edit: (xml: string) => string) => { parts[path] = strToU8(edit(strFromU8(parts[path]))); };

test("Excel templates and standard cell types preserve exact identities, Unicode, numbers and booleans", async () => {
  const parsed = await parseInventoryXlsx(workbook());
  assert.equal(parsed.worksheet, "Inventory");
  const vehicles = normalizeInventoryRows(parsed.rows, true, "xlsx");
  assert.equal(vehicles[0].stockId, "001-HONDA"); assert.equal(vehicles[0].variant, row.variant);
  assert.equal(vehicles[0].price, row.price); assert.equal(vehicles[0].financeEligible, false); assert.equal(vehicles[0].exchangeEligible, true);
  assert.equal(vehicles[0].source, "xlsx"); assert.equal(vehicles[0].publishStatus, "draft");
  await assert.rejects(parseInventoryXlsx(Buffer.from(inventoryXlsxTemplate()).toString("base64")), InventoryValidationError);
});
test("shared rich text, worksheet relationships and a renamed single sheet remain importable", async () => {
  const parsed = await parseInventoryXlsx(workbook(parts => {
    editXml(parts, "xl/worksheets/sheet1.xml", text => text.replace('<c r="A2" t="inlineStr"><is><t>001-HONDA</t></is></c>', '<c r="A2" t="s"><v>0</v></c>'));
    parts["xl/sharedStrings.xml"] = strToU8('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>001-</t></r><r><t>HONDA</t></r><rPh><t>ignore annotation</t></rPh></si></sst>');
    editXml(parts, "xl/workbook.xml", text => text.replace('name="Inventory"', 'name="Dealer stock"').replace('name="Guide" sheetId="2"', 'name="Guide" state="hidden" sheetId="2"'));
    parts["xl/worksheets/custom.xml"] = parts["xl/worksheets/sheet1.xml"]; delete parts["xl/worksheets/sheet1.xml"];
    editXml(parts, "xl/_rels/workbook.xml.rels", text => text.replace('worksheets/sheet1.xml', '/xl/worksheets/custom.xml'));
  }));
  assert.equal(parsed.worksheet, "Dealer stock"); assert.equal(parsed.rows[0].stockId, "001-HONDA");
});
test("Excel rejects formulas, macro/linked parts, hidden data, merged cells and ambiguous sheets", async () => {
  const changes: ((parts: Record<string, Uint8Array>) => void)[] = [
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<c r="F2"><v>', '<c r="F2"><f>1+1</f><v>')),
    p => { p["xl/vbaProject.bin"] = strToU8("macro"); },
    p => editXml(p, "[Content_Types].xml", x => x.replace('spreadsheetml.sheet.main+xml', 'ms-excel.sheet.macroEnabled.main+xml')),
    p => editXml(p, "xl/_rels/workbook.xml.rels", x => x.replace('Target="worksheets/sheet1.xml"', 'Target="https://example.com/file.xml" TargetMode="External"')),
    p => { p["xl/externalLinks/externalLink1.xml"] = strToU8("linked"); },
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<row r="2">', '<row r="2" hidden="1">')),
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<col min="1"', '<col hidden="true" min="1"')),
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('</worksheet>', '<mergeCells><mergeCell ref="A2:B2"/></mergeCells></worksheet>')),
    p => editXml(p, "xl/workbook.xml", x => x.replace('name="Inventory"', 'name="Stock"')),
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<c r="A2" t="inlineStr"><is><t>001-HONDA</t></is></c>', '<c r="A2"><v>1</v></c>')),
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<c r="B2" t="inlineStr">', '<c r="B2" t="e">')),
    p => { editXml(p, "xl/styles.xml", x => x.replace('numFmtId="49"', 'numFmtId="14"')); editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<c r="F2">', '<c r="F2" s="2">')); },
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<c r="F2">', '<c r="F2" s="999">')),
    p => { editXml(p, "xl/styles.xml", x => x.replace('numFmtId="49"', 'numFmtId="14"')); editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('min="2" max="17"', 'min="2" max="17" style="2"')); },
    p => { editXml(p, "xl/styles.xml", x => x.replace('numFmtId="49"', 'numFmtId="14"')); editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<row r="2">', '<row r="2" s="2" customFormat="1">')); },
  ];
  for (const change of changes) await assert.rejects(parseInventoryXlsx(workbook(change)), InventoryValidationError);
  try { await parseInventoryXlsx(workbook(changes[0])); assert.fail(); } catch (error) { assert.ok(error instanceof InventoryValidationError); assert.equal(error.issues[0].row, 2); assert.equal(error.issues[0].field, "price"); }
});
test("Excel archives and XML are bounded, malformed values and out-of-header data never disappear", async () => {
  for (const input of ["", "not-base64!", Buffer.from("not a zip").toString("base64"), Buffer.alloc(250001).toString("base64")]) await assert.rejects(parseInventoryXlsx(input), InventoryValidationError);
  const changes: ((parts: Record<string, Uint8Array>) => void)[] = [
    p => { p["large.xml"] = strToU8(" ".repeat(2000001)); },
    p => { for (let i = 0; i < 81; i++) p[`part-${i}.xml`] = strToU8("<x/>"); },
    p => editXml(p, "xl/workbook.xml", x => '<!DOCTYPE workbook [<!ENTITY bad "data">]>' + x),
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<row r="2">', '<row r="202">').replaceAll(/([A-Q])2"/g, '$1202"')),
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('r="Q2"', 'r="R2"')),
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('r="Q2"', 'r="P2"')),
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<c r="A2" t="inlineStr"><is><t>001-HONDA</t></is></c>', '<c r="A2" t="s"><v>99999</v></c>')),
    p => { p["xl/workbook.xml"] = strToU8('<workbook><sheets></workbook>'); },
    p => { p["xl/workbook.xml"] = Uint8Array.from([0xff, 0xfe, 0xff]); },
    p => editXml(p, "xl/worksheets/sheet1.xml", x => x.replace('<c r="Q1" t="inlineStr" s="1"><is><t xml:space="preserve">exchangeEligible</t></is></c>', "")),
  ];
  for (const change of changes) await assert.rejects(parseInventoryXlsx(workbook(change)), InventoryValidationError);
  // A false expanded size must be rejected by actual streaming validation, not just directory metadata.
  const forged = Buffer.from(workbook(p => { p["forged.xml"] = strToU8(" ".repeat(2000001)); }), "base64");
  for (let offset = 0; offset < forged.length - 46; offset++) if (forged.readUInt32LE(offset) === 0x02014b50 && forged.subarray(offset + 46, offset + 46 + forged.readUInt16LE(offset + 28)).toString() === "forged.xml") { forged.writeUInt32LE(1000, offset + 24); break; }
  await assert.rejects(parseInventoryXlsx(forged.toString("base64")), InventoryValidationError);
  const parsed = await parseInventoryXlsx(workbook(undefined, dataRow(row) + dataRow({ ...row, stockId: "002-HONDA", price: -1 }, 3)));
  assert.throws(() => normalizeInventoryRows(parsed.rows, true, "xlsx"), error => error instanceof InventoryValidationError && error.issues[0].row === 3);
  for (const price of ["0x12", "Infinity", "=100000", "12,00,000", "1200000 INR"]) assert.throws(() => normalizeInventoryRows([{ ...parsed.rows[0], price }], true), InventoryValidationError);
  assert.equal(normalizeInventoryRows([{ ...parsed.rows[0], price: "1.2e6" }], true)[0].price, 1200000);
});
