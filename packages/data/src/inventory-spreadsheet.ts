import { fromBuffer, type Entry } from "yauzl";
import { SaxesParser } from "saxes";
import { InventoryValidationError } from "./errors";
import { inventoryColumns, parseInventoryCsv } from "./inventory-input";

export const inventoryFileLimit = 250000;
const partLimit = 2000000;
const expandedLimit = 4000000;
const spreadsheetNamespaces = new Set([
  "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  "http://purl.oclc.org/ooxml/spreadsheetml/main",
]);
function invalid(message: string, row = 1, field = "file"): never {
  throw new InventoryValidationError([{ row, field, message }]);
}
interface XmlNode { name: string; uri: string; attrs: Record<string, string>; text: string; children: XmlNode[] }
function xml(bytes: Buffer | undefined): XmlNode {
  if (!bytes) invalid("The Excel workbook is missing a required part.");
  let source: string;
  try { source = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return invalid("Save the workbook as a standard .xlsx file with UTF-8 XML."); }
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) invalid("XML entity declarations are not supported.");
  const parser = new SaxesParser({ xmlns: true });
  const stack: XmlNode[] = [];
  let root: XmlNode | undefined, count = 0;
  parser.on("opentag", tag => {
    if (++count > 50000 || stack.length >= 32) invalid("The workbook XML is too complex. Use the inventory template.");
    const node: XmlNode = { name: tag.local, uri: tag.uri, attrs: Object.fromEntries(Object.values(tag.attributes).map(a => [a.name, a.value])), text: "", children: [] };
    if (stack.length) stack.at(-1)!.children.push(node); else root = node;
    stack.push(node);
  });
  const append = (text: string) => {
    const node = stack.at(-1);
    if (node) { node.text += text; if (node.text.length > 65536) invalid("A workbook value is too long."); }
  };
  parser.on("text", append); parser.on("cdata", append);
  parser.on("closetag", () => { stack.pop(); });
  parser.on("doctype", () => invalid("XML entity declarations are not supported."));
  parser.on("error", () => invalid("The workbook contains invalid XML. Save it again as .xlsx."));
  parser.write(source).close();
  if (!root) invalid("The workbook contains an empty XML part.");
  return root;
}
const children = (node: XmlNode, name: string) => node.children.filter(c => c.name === name);
const child = (node: XmlNode, name: string) => children(node, name)[0];
function spreadsheetRoot(node: XmlNode, name: string) {
  if (node.name !== name || !spreadsheetNamespaces.has(node.uri)) invalid("Use a standard Excel .xlsx workbook.");
}
function richText(node: XmlNode | undefined): string {
  if (!node) return "";
  // Phonetic annotations are not part of the cell's actual value.
  return node.children.filter(n => n.name === "t" || n.name === "r").map(n => n.name === "t" ? n.text : richText(n)).join("");
}

async function workbookParts(buffer: Buffer): Promise<Map<string, Buffer>> {
  if (!buffer.length || buffer.length > inventoryFileLimit) invalid("Choose an Excel file up to 250 KB.");
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
      if (error || !zip) { reject(new InventoryValidationError([{ row: 1, field: "file", message: "Choose a valid .xlsx workbook; .xls and password-protected files are not supported." }])); return; }
      const parts = new Map<string, Buffer>(), names = new Set<string>();
      let declared = 0, expanded = 0, settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true; zip.close();
        reject(new InventoryValidationError([{ row: 1, field: "file", message }]));
      };
      zip.on("error", () => fail("The Excel archive is damaged or unsupported."));
      zip.on("end", () => { if (!settled) { settled = true; zip.close(); resolve(parts); } });
      zip.on("entry", (entry: Entry) => {
        if (settled) return;
        const name = entry.fileName;
        if (names.size >= 80 || names.has(name.toLowerCase()) || /(?:^|\/)\.\.?\//.test(name)) { fail("The workbook has duplicate or unsupported archive entries."); return; }
        names.add(name.toLowerCase()); declared += entry.uncompressedSize;
        if (entry.uncompressedSize > partLimit || declared > expandedLimit) { fail("The expanded workbook is too large. Use the inventory template with at most 200 rows."); return; }
        if (entry.isEncrypted() || ![0, 8].includes(entry.compressionMethod)) { fail("Encrypted or unsupported workbook compression is not allowed."); return; }
        if (/\.bin$|(?:^|\/)(?:externalLinks|embeddings)\//i.test(name)) { fail("Macros, embedded objects and linked workbooks are not supported."); return; }
        if (name.endsWith("/")) { zip.readEntry(); return; }
        zip.openReadStream(entry, (readError, stream) => {
          if (readError || !stream) { fail("The Excel archive is damaged or unsupported."); return; }
          const chunks: Buffer[] = []; let size = 0;
          stream.on("error", () => fail("The Excel archive has invalid entry sizes or compressed data."));
          stream.on("data", (chunk: Buffer) => {
            size += chunk.length; expanded += chunk.length;
            if (size > partLimit || expanded > expandedLimit) { stream.destroy(); fail("The expanded workbook is too large. Use the inventory template with at most 200 rows."); return; }
            if (/\.(xml|rels)$/.test(name)) chunks.push(chunk);
          });
          stream.on("end", () => { if (!settled) { if (/\.(xml|rels)$/.test(name)) parts.set(name, Buffer.concat(chunks)); zip.readEntry(); } });
        });
      });
      zip.readEntry();
    });
  });
}

export interface ParsedInventorySpreadsheet { rows: Record<string, string>[]; worksheet: string }
export async function parseInventoryXlsx(input: unknown): Promise<ParsedInventorySpreadsheet> {
  if (typeof input !== "string" || input.length > Math.ceil(inventoryFileLimit / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input)) invalid("Upload the Excel file again; its encoding is invalid.");
  const parts = await workbookParts(Buffer.from(input, "base64"));
  const types = xml(parts.get("[Content_Types].xml"));
  if (types.name !== "Types" || !types.children.some(t => t.name === "Override" && t.attrs.PartName === "/xl/workbook.xml" && t.attrs.ContentType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml") || types.children.some(t => /macroEnabled|vbaProject/i.test(t.attrs.ContentType ?? ""))) invalid("Use .xlsx without macros, rather than .xls or .xlsm.");
  const workbook = xml(parts.get("xl/workbook.xml")); spreadsheetRoot(workbook, "workbook");
  if (child(workbook, "externalReferences")) invalid("Linked workbooks are not supported. Paste values into the inventory template.");
  const relationships = xml(parts.get("xl/_rels/workbook.xml.rels"));
  if (relationships.name !== "Relationships") invalid("The workbook relationships are invalid.");
  const relations = children(relationships, "Relationship");
  if (relations.some(r => r.attrs.TargetMode === "External")) invalid("Linked workbooks are not supported. Paste values into the inventory template.");
  const sheets = child(workbook, "sheets");
  const visible = sheets ? children(sheets, "sheet").filter(s => !s.attrs.state || s.attrs.state === "visible") : [];
  const inventory = visible.filter(s => (s.attrs.name ?? "").toLowerCase() === "inventory");
  const selected = inventory.length === 1 ? inventory[0] : visible.length === 1 ? visible[0] : undefined;
  if (!selected) invalid("Choose one visible worksheet named Inventory, or use a workbook with a single visible worksheet.");
  const relation = relations.find(r => r.attrs.Id === selected.attrs["r:id"] || r.attrs.Id === Object.entries(selected.attrs).find(([key]) => key.endsWith(":id"))?.[1]);
  if (!relation || !(relation.attrs.Type ?? "").endsWith("/worksheet")) invalid("The Inventory sheet must be a standard worksheet.");
  const target = relation.attrs.Target;
  if (!target) invalid("The workbook worksheet relationship has no target.");
  const sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  if (!/^xl\/worksheets\/[^/]+\.xml$/.test(sheetPath)) invalid("The Inventory worksheet path is unsupported.");
  const sharedRoot = parts.has("xl/sharedStrings.xml") ? xml(parts.get("xl/sharedStrings.xml")) : undefined;
  if (sharedRoot) spreadsheetRoot(sharedRoot, "sst");
  const shared = sharedRoot ? children(sharedRoot, "si").map(richText) : [];
  if (shared.length > 10000 || shared.some(v => v.length > 2048)) invalid("The workbook contains too many or overly long shared strings.");
  const styles = parts.has("xl/styles.xml") ? xml(parts.get("xl/styles.xml")) : undefined;
  if (styles) spreadsheetRoot(styles, "styleSheet");
  const formats = new Map((styles ? child(styles, "numFmts")?.children ?? [] : []).map(n => [Number(n.attrs.numFmtId), n.attrs.formatCode ?? ""]));
  const styleFormats = styles ? child(styles, "cellXfs")?.children.map(n => Number(n.attrs.numFmtId ?? 0)) ?? [] : [];
  const dateFormat = (id: number) => (id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 45 && id <= 47) || (id >= 50 && id <= 58) || /[ymdhs]/i.test((formats.get(id) ?? "").replace(/"[^"]*"|\\.|\[[^\]]*\]/g, "")) || /\[[hms]+\]/i.test(formats.get(id) ?? "");
  const sheet = xml(parts.get(sheetPath)); spreadsheetRoot(sheet, "worksheet");
  const sheetData = child(sheet, "sheetData");
  if (!sheetData) invalid("The Inventory worksheet is empty.");
  if (child(sheet, "cols")?.children.some(c => c.attrs.hidden === "1" || c.attrs.hidden === "true")) invalid("Unhide Inventory columns before importing so every field can be reviewed.");
  if (child(sheet, "mergeCells")) invalid("Unmerge cells in the Inventory worksheet before importing.");
  const grid = new Map<number, string[]>(); let previousRow = 0;
  const sheetRows = children(sheetData, "row");
  if (sheetRows.length > 1000) invalid("The worksheet has too many formatted rows. Use the inventory template.");
  for (const row of sheetRows) {
    const rowIndex = row.attrs.r ? Number(row.attrs.r) : previousRow + 1;
    if (!Number.isInteger(rowIndex) || rowIndex <= previousRow || rowIndex > 1000) invalid("Worksheet rows are out of order or exceed the template limits.");
    previousRow = rowIndex;
    if (row.attrs.hidden === "1" || row.attrs.hidden === "true") invalid("Unhide Inventory rows before importing so every record can be reviewed.", rowIndex);
    const values: string[] = [], cells = children(row, "c"); let previousColumn = -1;
    for (const cell of cells) {
      let column = previousColumn + 1;
      if (cell.attrs.r) {
        const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cell.attrs.r);
        if (!match || Number(match[2]) !== rowIndex) invalid("The workbook contains an invalid cell address.", rowIndex);
        column = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
      }
      if (column <= previousColumn || column > 255) invalid("Worksheet cells are out of order or exceed the template limits.", rowIndex);
      previousColumn = column;
      const headerField = grid.get(1)?.[column];
      const field = inventoryColumns.includes(headerField as typeof inventoryColumns[number]) ? headerField! : "file";
      if (child(cell, "f")) invalid("Replace formulas with their values before importing.", rowIndex, field);
      const type = cell.attrs.t ?? "n", raw = child(cell, "v")?.text ?? "";
      let value: string;
      if (type === "s") {
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) >= shared.length) invalid("The workbook contains an invalid shared string.", rowIndex, field);
        value = shared[Number(raw)];
      } else if (type === "inlineStr") value = richText(child(cell, "is"));
      else if (type === "b") { if (raw !== "0" && raw !== "1") invalid("Use true or false for eligibility flags.", rowIndex, field); value = raw === "1" ? "true" : "false"; }
      else if (type === "n" || type === "str") {
        if (type === "n" && raw && cell.attrs.s) {
          const style = Number(cell.attrs.s);
          if (!Number.isInteger(style) || style < 0 || style >= styleFormats.length) invalid("The workbook contains an invalid cell style.", rowIndex, field);
          if (dateFormat(styleFormats[style])) invalid("Replace date/time cells with plain inventory values before importing.", rowIndex, field);
        }
        value = raw;
      }
      else return invalid("Use plain text, numbers or true/false cells; dates and error cells are not supported.", rowIndex, field);
      if (value.length > 2048) invalid("A workbook cell is too long.", rowIndex, field);
      if (rowIndex > 1 && grid.get(1)?.[column] === "stockId" && value && type === "n") invalid("Format Stock ID cells as Text to preserve leading zeros and exact identities.", rowIndex, "stockId");
      if (column >= inventoryColumns.length && value.trim()) invalid("Remove non-template columns from the Inventory worksheet.", rowIndex);
      values[column] = value;
    }
    if (values.some(v => v.trim())) grid.set(rowIndex, values);
  }
  const lastRow = Math.max(0, ...grid.keys());
  if (lastRow > 201) invalid("Provide at most 200 vehicles directly below the header in row 1.");
  const header = grid.get(1) ?? [];
  while (header.length && !header.at(-1)?.trim()) header.pop();
  const width = header.length;
  for (const [index, values] of grid) if (values.slice(width).some(v => v.trim())) invalid("Remove values outside the template header columns.", index);
  if (!width) invalid("Put the template column names in row 1.");
  const csv = Array.from({ length: lastRow }, (_, i) => Array.from({ length: width }, (_, j) => `"${(grid.get(i + 1)?.[j] ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
  return { rows: parseInventoryCsv(csv), worksheet: selected.attrs.name };
}
