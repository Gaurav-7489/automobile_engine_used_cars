"use client";

import { useMemo, useState } from "react";
import { addVehicle, emptyVehicleInput, updateVehicle, validateVehicle, type VehicleInput } from "@/lib/actions";
import type { CostLedger, Vehicle } from "@/lib/domain";
import { formatExact, formatMoney } from "@/lib/format";
import { Drawer } from "../overlay";
import { useToast } from "../toast";
import { Badge, Button, Check, FormSummary, Notice, RupeeField, SelectField, Tabs, TextField } from "../ui";
import { useWorkspace } from "../workspace";

type TabKey = "details" | "costs" | "media" | "documents" | "publishing";
const TABS: { value: TabKey; label: string }[] = [{ value: "details", label: "Details" }, { value: "costs", label: "Costs" }, { value: "media", label: "Media" }, { value: "documents", label: "Documents" }, { value: "publishing", label: "Publishing" }];
const FIELD_TAB: Record<string, TabKey> = { make: "details", model: "details", variant: "details", year: "details", fuel: "details", transmission: "details", km: "details", owners: "details", acquiredOn: "details", registration: "details", asking: "costs", photos: "media" };
const COST_LABELS: [keyof CostLedger, string][] = [["acquisition", "Acquisition"], ["transport", "Transport"], ["inspection", "Inspection"], ["refurbishment", "Refurbishment"], ["fees", "Purchase fees"]];

const paiseToInput = (paise: number): string => (paise ? String(paise / 100) : "");

function fromVehicle(v: Vehicle): VehicleInput {
  return {
    make: v.make, model: v.model, variant: v.variant, year: String(v.year), fuel: v.fuel, transmission: v.transmission, km: String(v.km), owners: String(v.owners), registration: v.registration, acquiredOn: v.acquiredAt.slice(0, 10), branchId: v.branchId,
    status: v.status === "available" ? "available" : "preparation", asking: v.asking === null ? "" : String(v.asking / 100), photos: v.hasImages ? "1" : "0",
    costs: { acquisition: paiseToInput(v.costs.acquisition), transport: paiseToInput(v.costs.transport), inspection: paiseToInput(v.costs.inspection), refurbishment: paiseToInput(v.costs.refurbishment), fees: paiseToInput(v.costs.fees) },
  };
}

export function VehicleDrawer({ open, onClose, vehicle, defaultBranch }: { open: boolean; onClose: () => void; vehicle?: Vehicle; defaultBranch: string }) {
  const { run, state, can, session } = useWorkspace();
  const toast = useToast();
  const editing = Boolean(vehicle);
  const initial = useMemo(() => (vehicle ? fromVehicle(vehicle) : emptyVehicleInput(defaultBranch)), [vehicle, defaultBranch]);
  const [form, setForm] = useState<VehicleInput>(initial);
  const [tab, setTab] = useState<TabKey>("details");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState<{ version: number; asking: number | null; km: number } | null>(null);
  const [files] = useState<string[]>([]);
  const [docs, setDocs] = useState<Record<string, boolean>>(() => Object.fromEntries((vehicle?.documents ?? [{ name: "Registration certificate", provided: false }, { name: "Inspection report", provided: false }, { name: "Service history", provided: false }]).map((d) => [d.name, d.provided])));
  const expectedVersion = vehicle?.version ?? 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || files.length > 0;
  const allowed = can("inventory.edit");
  const permittedBranches = state.branches.filter((b) => session.branchIds.includes(b.id));
  const landed = COST_LABELS.reduce((sum, [key]) => sum + Math.round(Number(form.costs[key].replace(/[₹,\s]/g, "") || 0) * 100), 0);

  const set = <K extends keyof VehicleInput>(key: K, value: VehicleInput[K]) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => { const { [key as string]: _drop, ...rest } = e; void _drop; return rest; }); };
  const setCost = (key: keyof CostLedger, value: string) => setForm((f) => ({ ...f, costs: { ...f.costs, [key]: value } }));

  function save(status: "preparation" | "available") {
    const candidate: VehicleInput = { ...form, status, photos: String(Math.max(Number(form.photos) || 0, files.length)) };
    const problems = validateVehicle(candidate, state.live);
    if (editing) {
      for (const key of ["make", "model", "asking", "acquiredOn", "fuel", "transmission", "year", "registration"]) delete problems[key];
      if (status === "available") delete problems.asking;
    }
    if (Object.keys(problems).length) {
      setErrors(problems);
      const first = Object.keys(problems)[0];
      setTab(FIELD_TAB[first] ?? (first.startsWith("costs") ? "costs" : "details"));
      return;
    }
    if (editing && vehicle) {
      const toPaise = (t: string) => Math.round(Number(t.replace(/[₹,\s]/g, "") || 0) * 100);
      const result = run((s, a) => updateVehicle(s, a, vehicle.id, expectedVersion, {
        variant: form.variant.trim(), km: Number(form.km.replace(/,/g, "")), owners: Number(form.owners), hasImages: Number(candidate.photos) > 0, documents: Object.entries(docs).map(([name, provided]) => ({ name, provided })), branchId: form.branchId,
        costs: { acquisition: toPaise(form.costs.acquisition), transport: toPaise(form.costs.transport), inspection: toPaise(form.costs.inspection), refurbishment: toPaise(form.costs.refurbishment), fees: toPaise(form.costs.fees) },
      }));
      if (!result.ok) {
        if (result.status === 409 && result.latest) { setConflict({ version: Number(result.latest.version), asking: (result.latest.asking as number | null) ?? null, km: Number(result.latest.km) }); return; }
        setErrors(result.fields ?? { form: result.message });
        return;
      }
      toast(`${vehicle.id} saved. Version ${vehicle.version + 1}.`);
      onClose();
      return;
    }
    const result = run((s, a) => addVehicle(s, a, candidate));
    if (!result.ok) { setErrors(result.fields ?? { form: result.message }); return; }
    toast(`${result.vehicle.id} added as ${status === "available" ? "Available" : "In preparation"}.`);
    onClose();
  }

  return (
    <Drawer open={open} onClose={onClose} dirty={dirty} size="w560" title={editing ? `Edit ${vehicle!.id}` : "Add vehicle"} description={editing ? `${vehicle!.make} ${vehicle!.model} / version ${vehicle!.version}` : "Save a draft with incomplete media, or make it Available once required fields are complete."}
      footer={allowed ? (
        <>
          <Button onClick={onClose}>Cancel</Button>
          {!editing || vehicle!.status === "preparation" ? <Button onClick={() => save("preparation")}>Save draft</Button> : null}
          <Button variant="primary" onClick={() => save(editing && vehicle!.status === "available" ? "available" : "available")}>{editing ? "Save changes" : "Save as Available"}</Button>
        </>
      ) : <Button onClick={onClose}>Close</Button>}>
      {!allowed ? <Notice tone="warn" role="status">Your role is read-only for inventory. Ask an owner or manager to make changes.</Notice> : null}
      {conflict ? (
        <div className="notice warn" role="alert">
          <strong>This vehicle changed while you were editing.</strong>
          <p>Latest server version {conflict.version}: {conflict.km.toLocaleString("en-IN")} km{conflict.asking !== null ? `, asking ${formatMoney(conflict.asking)}` : ""}. Your changes are kept below.</p>
          <div className="row-flex mt-2"><Button size="sm" onClick={() => { setConflict(null); onClose(); }}>Reload latest</Button><Button size="sm" variant="primary" onClick={() => { setConflict(null); toast("Review the latest values, then save again.", "ok"); }}>Reapply my changes</Button></div>
        </div>
      ) : null}
      <FormSummary errors={errors} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Vehicle sections" idPrefix="veh" />
      {tab === "details" ? (
        <div className="form-grid" role="tabpanel" aria-labelledby={`veh-${tab}`}>
          <TextField label="Make" required value={form.make} onChange={(e) => set("make", e.target.value)} error={errors.make} disabled={editing} data-autofocus />
          <TextField label="Model" required value={form.model} onChange={(e) => set("model", e.target.value)} error={errors.model} disabled={editing} />
          <TextField label="Variant" required value={form.variant} onChange={(e) => set("variant", e.target.value)} error={errors.variant} />
          <TextField label="Model year" required inputMode="numeric" value={form.year} onChange={(e) => set("year", e.target.value)} error={errors.year} disabled={editing} help="YYYY" />
          <SelectField label="Fuel" required value={form.fuel} onChange={(e) => set("fuel", e.target.value as VehicleInput["fuel"])} error={errors.fuel} options={["Diesel", "Petrol", "Hybrid", "Electric"]} placeholder="Choose fuel" disabled={editing} />
          <SelectField label="Transmission" required value={form.transmission} onChange={(e) => set("transmission", e.target.value as VehicleInput["transmission"])} error={errors.transmission} options={["Automatic", "Manual"]} placeholder="Choose transmission" disabled={editing} />
          <TextField label="Odometer (km)" required inputMode="numeric" value={form.km} onChange={(e) => set("km", e.target.value)} error={errors.km} />
          <TextField label="Previous owners" required inputMode="numeric" value={form.owners} onChange={(e) => set("owners", e.target.value)} error={errors.owners} />
          <TextField label="Registration (masked by default)" value={form.registration} onChange={(e) => set("registration", e.target.value)} error={errors.registration} disabled={editing} placeholder="KL 07 AB 1234" help="Shown masked outside this form." />
          <TextField label="Acquisition date" required type="date" value={form.acquiredOn} onChange={(e) => set("acquiredOn", e.target.value)} error={errors.acquiredOn} disabled={editing} />
          <SelectField label="Branch" required value={form.branchId} onChange={(e) => set("branchId", e.target.value)} options={permittedBranches.map((b) => ({ value: b.id, label: b.name }))} />
          {editing ? <div className="field"><span className="label">Lifecycle state</span><div><Badge tone="accent">{vehicle!.status === "preparation" ? "In preparation" : vehicle!.status[0].toUpperCase() + vehicle!.status.slice(1)}</Badge></div><span className="help">State changes use explicit transition forms in the Inventory table.</span></div> : null}
        </div>
      ) : null}
      {tab === "costs" ? (
        <div className="stack" role="tabpanel" aria-labelledby={`veh-${tab}`}>
          <div className="form-grid">
            {COST_LABELS.map(([key, label]) => <RupeeField key={key} label={label} value={form.costs[key]} onChange={(raw) => setCost(key, raw)} error={errors[`costs.${key}`]} placeholder="₹0" help={key === "acquisition" ? "Required for Available" : undefined} />)}
          </div>
          <div className="card tight"><div className="spread"><span className="muted">Landed cost</span><strong>{formatExact(landed)}</strong></div><p className="help mt-2">Acquisition + transport + inspection + refurbishment + purchase fees. Holding and selling costs are separate.</p></div>
          <RupeeField label="Asking price" value={form.asking} onChange={(raw) => set("asking", raw)} error={errors.asking} disabled={editing} placeholder="₹28,50,000" help={editing ? "Asking price changes go through Pricing Intelligence and need approval. No direct edits." : "Set once at creation. Later changes need an approved price request."} />
        </div>
      ) : null}
      {tab === "media" ? (
        <div className="stack" role="tabpanel" aria-labelledby={`veh-${tab}`}>
          <div className="field"><h3 className="h3">Photos</h3>
            <p className="help" id="veh-photos-help">Photo upload is not part of this release. Photos are attached in Command Center and appear here as soon as they are on the vehicle record.</p>
            {errors.photos ? <div className="field-error" role="alert">{errors.photos}</div> : null}
          </div>
          {files.length ? <ul className="stack-sm" style={{ margin: 0, paddingLeft: 18 }}>{files.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="muted">{vehicle?.hasImages ? "Photos on file." : "No photos on file yet."}</p>}
        </div>
      ) : null}
      {tab === "documents" ? (
        <div className="stack-sm" role="tabpanel" aria-labelledby={`veh-${tab}`}>
          {Object.entries(docs).map(([name, provided]) => <Check key={name} label={name} checked={provided} onChange={(v) => setDocs((d) => ({ ...d, [name]: v }))} help={provided ? "Marked as provided" : "Not provided"} />)}
          <p className="help">Missing history is shown as Not provided; it is never presented as a clean history.</p>
        </div>
      ) : null}
      {tab === "publishing" ? (
        <div className="stack" role="tabpanel" aria-labelledby={`veh-${tab}`}>
          <p className="muted">Publishing opens a channel checklist and sync results from the Inventory table after the vehicle is Available.</p>
          <dl className="kv"><div><dt>Owned site</dt><dd>{vehicle?.channels.includes("Owned site") ? "Published" : "Not published"}</dd></div><div><dt>Marketplaces</dt><dd>Requires authorised publishing API</dd></div></dl>
        </div>
      ) : null}
    </Drawer>
  );
}
