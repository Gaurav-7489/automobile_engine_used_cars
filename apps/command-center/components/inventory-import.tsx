"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Vehicle } from "@vandlabs/contracts";
import type { InventoryDestination } from "./inventory-intake";

interface Issue { row: number; field: string; message: string }
interface ImportPreview { vehicles: Vehicle[]; format: "csv" | "xlsx"; worksheet?: string }
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
export function InventoryImport({ destination, disabled, onBusyChange }: { destination: InventoryDestination; disabled: boolean; onBusyChange: (busy: boolean) => void }) {
  const router = useRouter();
  const [csv, setCsv] = useState(""), [upload, setUpload] = useState<{ name: string; xlsx: string } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null), [reviewed, setReviewed] = useState(false);
  const [issues, setIssues] = useState<Issue[]>([]), [message, setMessage] = useState(""), [fileKey, setFileKey] = useState(0);
  const pending = useRef(false);
  function invalidate() { setPreview(null); setReviewed(false); setIssues([]); setMessage(""); }
  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; onBusyChange(true); setIssues([]); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "The import could not be completed. Try again."); }
    finally { pending.current = false; onBusyChange(false); }
  }
  async function submit(mode: "preview" | "commit") {
    const response = await fetch("/command/api/vehicles/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      dealershipId: destination.dealershipId, locationId: destination.locationId, mode, ...(upload ? { xlsx: upload.xlsx } : { csv }),
    }) });
    const result = await response.json();
    if (!response.ok) {
      setPreview(null); setReviewed(false);
      if (Array.isArray(result.issues)) { setIssues(result.issues); throw new Error("Fix the listed rows and preview the file again. No vehicles were added."); }
      throw new Error(result.error || "The import could not be completed. Preview again before retrying.");
    }
    return result.data as ImportPreview;
  }
  const total = preview?.vehicles.reduce((sum, vehicle) => sum + vehicle.price, 0) ?? 0;
  const report = "\uFEFFrow,field,message\r\n" + issues.map(issue => [issue.row, issue.field, issue.message].map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  return <details className="stock-import">
    <summary>Import Excel or CSV</summary>
    <div className="import-workspace">
      <div className="import-heading"><div><p className="eyebrow">Bulk inventory intake</p><h3>Your spreadsheet. Reviewed stock.</h3><p className="muted">Add up to 200 vehicles in one batch. Imports create drafts; review and publish each vehicle when it is ready.</p></div><span className="import-format">.xlsx / .csv · 250 KB</span></div>
      <ol className="import-steps"><li><strong>1. Prepare</strong><span>Use the template and plain values.</span></li><li><strong>2. Review</strong><span>Check every row and the destination.</span></li><li><strong>3. Add drafts</strong><span>All rows save together, then appear in stock.</span></li></ol>
      <div className="import-templates"><a href="/command/api/vehicles/template?format=xlsx" download="vandlabs-inventory-template.xlsx"><strong>Excel template</strong><span>Field guide, dropdowns and text stock IDs</span></a><a href="/command/api/vehicles/template?format=csv" download="vandlabs-inventory-template.csv"><strong>CSV template</strong><span>UTF-8 headers for your inventory export</span></a></div>
      <label className="import-upload"><span>Inventory file</span><input key={fileKey} disabled={disabled} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => {
        const file = event.target.files?.[0]; invalidate(); setUpload(null); setCsv("");
        if (!file) return;
        if (file.size > 250000) { setMessage("Choose an Excel or CSV file up to 250 KB."); return; }
        const extension = file.name.toLowerCase().split(".").at(-1);
        if (extension !== "csv" && extension !== "xlsx") { setMessage("Choose .xlsx or UTF-8 .csv. Convert .xls or .xlsm to .xlsx with plain values first."); return; }
        void run(async () => {
          if (extension === "csv") setCsv(await file.text());
          else {
            const bytes = new Uint8Array(await file.arrayBuffer()); let binary = "";
            for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
            setUpload({ name: file.name, xlsx: btoa(binary) });
          }
        });
      }}/><small>Excel reads the visible Inventory worksheet, or the only visible sheet. Formulas, macros, linked workbooks, hidden rows and merged cells must be removed.</small></label>
      {upload ? <div className="import-file"><div><strong>{upload.name}</strong><span>Ready to validate on the server.</span></div><button type="button" disabled={disabled} onClick={() => { invalidate(); setUpload(null); setFileKey(key => key + 1); }}>Remove file</button></div> : <label><span>CSV contents</span><textarea disabled={disabled} rows={5} value={csv} maxLength={250000} spellCheck={false} placeholder="Paste CSV here, or choose a file above." onChange={event => { setCsv(event.target.value); invalidate(); }}/></label>}
      <div className="import-actions"><button type="button" disabled={disabled || !(upload || csv.trim())} onClick={() => void run(async () => { setPreview(null); setReviewed(false); const data = await submit("preview"); setPreview(data); setMessage(`${data.vehicles.length} valid ${data.vehicles.length === 1 ? "draft" : "drafts"} ready for review.`); })}>{disabled && pending.current ? "Working…" : "Preview import"}</button><span className="muted">Destination: {destination.label}</span></div>
      {issues.length ? <section className="import-errors" aria-label="Import validation errors"><div><h3>Fix before importing</h3><a download="inventory-import-errors.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(report)}`}>Download error report</a></div><div className="table-scroll" role="region" aria-label="Row validation errors" tabIndex={0}><table><thead><tr><th>Worksheet / CSV row</th><th>Field</th><th>What to fix</th></tr></thead><tbody>{issues.map((issue, i) => <tr key={`${issue.row}-${issue.field}-${i}`}><td>{issue.row}</td><td>{issue.field}</td><td>{issue.message}</td></tr>)}</tbody></table></div></section> : null}
      {preview ? <section className="import-review" aria-label="Import review"><div className="import-review-head"><div><p className="eyebrow">Validated preview · no records saved</p><h3>{preview.vehicles.length} {preview.vehicles.length === 1 ? "draft" : "drafts"} to review</h3><p>{destination.label}{preview.worksheet ? ` · Worksheet: ${preview.worksheet}` : " · CSV"}</p></div><div><span>Total asking price</span><strong>{money(total)}</strong><small>Sum of listed prices</small></div></div>
        <div className="table-scroll" role="region" aria-label="Draft vehicle preview" tabIndex={0}><table><thead><tr><th>Row / Stock</th><th>Vehicle / Variant</th><th>Price (INR)</th><th>Mileage</th><th>Fuel / Gearbox</th><th>Owners / Body / Condition</th><th>Colours</th><th>Image URL</th><th>Finance / Exchange</th><th>Publication</th></tr></thead><tbody>{preview.vehicles.map((vehicle, i) => <tr key={vehicle.id}><td><small>Row {i + 2}</small><strong>{vehicle.stockId}</strong></td><td>{vehicle.year} {vehicle.make} {vehicle.model}<small>{vehicle.variant}</small></td><td>{money(vehicle.price)}</td><td>{vehicle.mileage.toLocaleString("en-IN")} km</td><td>{vehicle.fuelType} / {vehicle.transmission}</td><td>{vehicle.ownership} / {vehicle.bodyType} / {vehicle.condition}</td><td>{vehicle.exteriorColor} / {vehicle.interiorColor}</td><td>{vehicle.media[0] ? <a href={vehicle.media[0].url} target="_blank" rel="noopener noreferrer">{vehicle.media[0].url}</a> : "No image"}</td><td>{vehicle.financeEligible ? "Yes" : "No"} / {vehicle.exchangeEligible ? "Yes" : "No"}</td><td><span className="stage">Draft</span></td></tr>)}</tbody></table></div>
        <label className="import-confirm"><input type="checkbox" checked={reviewed} disabled={disabled} onChange={event => setReviewed(event.target.checked)}/><span>I checked all rows, the destination and the rights to any supplied images.</span></label>
        <button type="button" disabled={disabled || !reviewed} onClick={() => void run(async () => { const data = await submit("commit"); setPreview(null); setReviewed(false); setCsv(""); setUpload(null); setFileKey(key => key + 1); setMessage(`Imported ${data.vehicles.length} draft ${data.vehicles.length === 1 ? "vehicle" : "vehicles"}.`); router.refresh(); })}>Import {preview.vehicles.length} {preview.vehicles.length === 1 ? "draft" : "drafts"}</button>
        <p className="muted">Import rechecks stock identities. An invalid or duplicate row rejects the whole batch. Existing vehicles are edited from the stock table.</p>
      </section> : null}
      <p role="status" aria-live="polite" className="import-status">{message}</p>
    </div>
  </details>;
}
