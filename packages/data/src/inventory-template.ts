import { strToU8, zipSync } from "fflate";
import { inventoryColumns } from "./inventory-input";

export function inventoryCsvTemplate(): string { return "\uFEFF" + inventoryColumns.join(",") + "\r\n"; }
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const column = (index: number) => String.fromCharCode(65 + index);
const cell = (address: string, value: string, style = 0) => `<c r="${address}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
const examples: Record<typeof inventoryColumns[number], [string, string]> = {
  stockId: ["STOCK-001", "Unique stock identity. Format as Text; letters, digits, hyphens and underscores; max 64 characters."],
  make: ["Honda", "Vehicle manufacturer; max 120 characters."], model: ["City", "Vehicle model; max 120 characters."],
  variant: ["ZX", "Variant or trim; max 120 characters."], year: ["2022", "Whole model year from 1900 through next year."],
  price: ["1200000", "INR asking price. Positive number without a currency symbol; at most two decimal places."],
  mileage: ["25000", "Whole kilometres from 0 to 2000000; no units in the cell."],
  fuelType: ["petrol", "petrol, diesel, hybrid or electric."], transmission: ["automatic", "manual or automatic."],
  ownership: ["1", "Whole owner count from 1 to 20."], bodyType: ["Sedan", "Body style; max 120 characters."],
  condition: ["good", "excellent, good or fair."], exteriorColor: ["White", "Exterior colour; max 120 characters."],
  interiorColor: ["Black", "Interior colour; max 120 characters."],
  imageUrl: ["", "Optional public HTTPS image URL. Check image rights. No credentials, local hosts or secret query parameters."],
  financeEligible: ["false", "Optional true or false; empty means false. Eligibility does not confirm financing approval."],
  exchangeEligible: ["false", "Optional true or false; empty means false."],
};
export function inventoryXlsxTemplate(): Uint8Array {
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const guides: string[][] = [
    ["VandLabs inventory import", "Required", "Example", "Field instructions"],
    ["Start here", "", "", "Enter your real vehicles on the Inventory worksheet, directly below row 1. This guide is not imported."],
    ["Review before saving", "", "", "Choose the dealership/location in Command Center, preview all rows, then import reviewed drafts. Publishing is a separate step."],
    ["File limits", "", "", "CSV or .xlsx; up to 250 KB and 200 vehicles. Plain values only. No formulas, macros, hidden rows, merged cells or linked workbooks."],
    ["Identity rules", "", "", "Imports add new stock only. Repeated identities reject the whole batch. Edit existing stock in the inventory table."],
    ...inventoryColumns.map((key, i) => [key, i < 14 ? "Yes" : "Optional", examples[key][0], examples[key][1]]),
  ];
  const validations = [["H", "petrol,diesel,hybrid,electric"], ["I", "manual,automatic"], ["L", "excellent,good,fair"], ["P", "true,false"], ["Q", "true,false"]].map(([col, list]) => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Choose a listed value" error="Use a value from the dropdown." sqref="${col}2:${col}201"><formula1>&quot;${list}&quot;</formula1></dataValidation>`).join("");
  const files: Record<string, string> = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/><sheet name="Guide" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    "xl/styles.xml": `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF355238"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="22" customWidth="1" style="2"/><col min="2" max="17" width="20" customWidth="1"/></cols><sheetData><row r="1" ht="32" customHeight="1">${inventoryColumns.map((key, i) => cell(`${column(i)}1`, key, 1)).join("")}</row></sheetData><autoFilter ref="A1:Q201"/><dataValidations count="5">${validations}</dataValidations></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet xmlns="${ns}"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="30" customWidth="1"/><col min="2" max="2" width="14" customWidth="1"/><col min="3" max="3" width="24" customWidth="1"/><col min="4" max="4" width="85" customWidth="1"/></cols><sheetData>${guides.map((values, i) => `<row r="${i + 1}" ht="${i === 0 ? 32 : 45}" customHeight="1">${values.map((value, j) => cell(`${column(j)}${i + 1}`, value, i === 0 ? 1 : 3)).join("")}</row>`).join("")}</sheetData></worksheet>`,
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, content]) => [path, strToU8(content)])), { level: 6, mtime: new Date("2026-01-01T00:00:00Z") });
}
