"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addVehicle, emptyVehicleInput, validateVehicle, vehicleChecks, type VehicleInput } from "@/lib/actions";
import type { CostLedger } from "@/lib/domain";
import { CarSelector } from "../car-selector";
import { Icon } from "../icons";
import { Drawer } from "../overlay";
import { useToast } from "../toast";
import { Button, FormSummary, Notice, RupeeField, SelectField, TextArea, TextField } from "../ui";
import { useWorkspace } from "../workspace";

/** Same limits the photo route enforces; checked here first so nobody waits for an upload that will be refused. */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_PHOTOS = 20;
const EXTRA_COSTS: [keyof CostLedger, string][] = [["transport", "Transport"], ["inspection", "Inspection"], ["refurbishment", "Repairs and detailing"], ["fees", "Purchase fees"]];

type Picked = { file: File; url: string };
type Phase = { kind: "form" } | { kind: "uploading"; done: number; total: number } | { kind: "upload-failed"; stockId: string; failed: Picked[]; message: string };

const rupees = (text: string) => Math.round(Number(text.replace(/[₹,\s]/g, "") || 0) * 100);

/**
 * Adding a car, on one page: photos first, then the car, the price and the paperwork. Photos are picked up front and uploaded as
 * soon as the server has confirmed the new stock record (never to an id the browser only guessed).
 */
export function AddVehicleDrawer({ open, onClose, defaultBranch }: { open: boolean; onClose: () => void; defaultBranch: string }) {
  const { runConfirmed, state, can, session, refresh } = useWorkspace();
  const toast = useToast();
  const permitted = state.branches.filter((b) => session.branchIds.includes(b.id));
  const startBranch = permitted.some((b) => b.id === defaultBranch) ? defaultBranch : permitted[0]?.id ?? defaultBranch;
  const [form, setForm] = useState<VehicleInput>(() => emptyVehicleInput(startBranch));
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [photoError, setPhotoError] = useState("");
  const [moreCosts, setMoreCosts] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ status: "preparation" | "available"; warnings: Record<string, string>; overrides: Record<string, string> } | null>(null);
  const [reason, setReason] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "form" });
  const picker = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);
  // Upload progress and problems appear at the top of the form; bring them into view wherever the person had scrolled to.
  useEffect(() => { if (phase.kind !== "form") top.current?.scrollIntoView({ block: "nearest" }); }, [phase.kind]);
  const allowed = can("inventory.edit");
  const branches = permitted;
  const landed = useMemo(() => (["acquisition", ...EXTRA_COSTS.map(([k]) => k)] as (keyof CostLedger)[]).reduce((sum, k) => sum + rupees(form.costs[k]), 0), [form.costs]);
  const dirty = JSON.stringify(form) !== JSON.stringify(emptyVehicleInput(startBranch)) || photos.length > 0;

  // Previews are object URLs; release them when they are no longer shown.
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof VehicleInput>(key: K, value: VehicleInput[K]) => { setForm((f) => ({ ...f, [key]: value })); setErrors((e) => { const next = { ...e }; delete next[key as string]; return next; }); };
  const setCost = (key: keyof CostLedger, value: string) => { setForm((f) => ({ ...f, costs: { ...f.costs, [key]: value } })); setErrors((e) => { const next = { ...e }; delete next[`costs.${key}`]; return next; }); };

  function pick(list: FileList | null) {
    if (!list?.length) return;
    const room = MAX_PHOTOS - photos.length;
    const accepted: Picked[] = [];
    const refused: string[] = [];
    for (const file of Array.from(list)) {
      if (!PHOTO_TYPES.includes(file.type)) refused.push(`${file.name} is not a JPEG, PNG or WebP photo`);
      else if (file.size > MAX_PHOTO_BYTES) refused.push(`${file.name} is larger than 8 MB`);
      else if (accepted.length >= room) refused.push(`${file.name}: a car can have up to ${MAX_PHOTOS} photos`);
      else accepted.push({ file, url: URL.createObjectURL(file) });
    }
    setPhotos((p) => [...p, ...accepted]);
    setPhotoError(refused.length ? `${refused.join(". ")}.` : "");
    setErrors((e) => { const next = { ...e }; delete next.photos; return next; });
    if (picker.current) picker.current.value = "";
  }
  function removePhoto(index: number) {
    setPhotos((p) => { URL.revokeObjectURL(p[index].url); return p.filter((_, i) => i !== index); });
  }
  function makeCover(index: number) {
    setPhotos((p) => [p[index], ...p.filter((_, i) => i !== index)]);
  }

  /** One photo per request keeps each upload well under the hosting platform's request-size limit. */
  async function upload(stockId: string, list: Picked[]): Promise<{ failed: Picked[]; message: string }> {
    const failed: Picked[] = [];
    let message = "";
    for (let i = 0; i < list.length; i += 1) {
      setPhase({ kind: "uploading", done: i, total: list.length });
      const body = new FormData();
      body.append("photos", list[i].file);
      const r = await fetch(`/api/vehicles/${encodeURIComponent(stockId)}/photos`, { method: "POST", body }).catch(() => null);
      if (!r?.ok) {
        failed.push(list[i]);
        const b = await r?.json().catch(() => null);
        message = b?.error?.message ?? "We could not reach the server.";
      }
    }
    return { failed, message };
  }

  async function finishUpload(stockId: string, list: Picked[]) {
    const { failed, message } = await upload(stockId, list);
    void refresh();
    if (failed.length) { setPhase({ kind: "upload-failed", stockId, failed, message }); return; }
    toast(`${stockId} added with ${list.length} photo${list.length === 1 ? "" : "s"}.`);
    onClose();
  }

  function save(status: "preparation" | "available", confirmed = false) {
    // In a live workspace photos upload right after saving, so the count picked here stands in for the photos on file.
    const candidate: VehicleInput = { ...form, status, photos: String(photos.length), acknowledged: confirmed, overrideReason: reason.trim() || undefined };
    const problems = validateVehicle(candidate, state.live);
    if (Object.keys(problems).length) {
      setErrors(problems);
      if (Object.keys(problems).some((k) => k.startsWith("costs.") && k !== "costs.acquisition")) setMoreCosts(true);
      return;
    }
    const checks = vehicleChecks(candidate);
    if (Object.keys(checks.overrides).length && session.role !== "owner") { setErrors({ ...checks.overrides, form: "These values need an Owner to review them before saving." }); return; }
    if (!confirmed && (Object.keys(checks.warnings).length || Object.keys(checks.overrides).length)) { setReview({ status, warnings: checks.warnings, overrides: checks.overrides }); return; }
    if (Object.keys(checks.overrides).length && reason.trim().length < 10) { setErrors({ override: "Say why these values are correct (at least 10 characters)." }); return; }
    setReview(null);

    const { result, confirmed: server } = runConfirmed((s, a) => addVehicle(s, a, candidate));
    if (!result.ok) { setErrors({ ...(result.fields ?? {}), form: result.message }); return; }
    const label = status === "available" ? "on sale" : "in preparation";
    if (!photos.length) { toast(`${result.vehicle.id} added ${label}.`); onClose(); return; }
    if (!state.live) { toast(`${result.vehicle.id} added ${label}. Sample workspace: photos are not uploaded.`); onClose(); return; }

    setPhase({ kind: "uploading", done: 0, total: photos.length });
    void server.then((outcome) => {
      // The server's copy of the new car is the only record photos may be attached to.
      const stockId = outcome.saved && outcome.vehicles.length === 1 ? outcome.vehicles[0] : null;
      if (!stockId) { setPhase({ kind: "form" }); setErrors({ form: "The car could not be saved, so the photos were not uploaded. Check the details and try again." }); return; }
      void finishUpload(stockId, photos);
    });
  }

  const busy = phase.kind === "uploading";
  return (
    <Drawer open={open} onClose={busy ? () => undefined : onClose} dirty={dirty && phase.kind === "form"} size="w560" title="Add a car" description="Photos, the car, its price and paperwork. Save it in preparation if you are still missing something."
      footer={!allowed ? <Button onClick={onClose}>Close</Button> : phase.kind === "form" ? (
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => save("preparation")}>Save in preparation</Button>
          <Button variant="primary" onClick={() => save("available")}>Save and put on sale</Button>
        </>
      ) : phase.kind === "uploading" ? <Button variant="primary" loading loadingLabel={`Uploading photo ${phase.done + 1} of ${phase.total}`}>Uploading</Button> : (
        <>
          <Button onClick={onClose}>Add photos later</Button>
          <Button variant="primary" onClick={() => void finishUpload(phase.stockId, phase.failed)}>Try again</Button>
        </>
      )}>
      <div ref={top} />
      {!allowed ? <Notice tone="warn" role="status">Your role can view stock but not add cars. Ask an owner or manager.</Notice> : null}
      {phase.kind === "upload-failed" ? (
        <Notice tone="warn" role="alert">{phase.stockId} is saved. {phase.failed.length} photo{phase.failed.length === 1 ? "" : "s"} did not upload: {phase.message} Try again, or add them later from the car&apos;s Photos tab.</Notice>
      ) : null}
      {phase.kind === "uploading" ? <div className="av-progress" role="status" aria-live="polite"><span style={{ width: `${Math.round((phase.done / phase.total) * 100)}%` }} />Uploading photo {phase.done + 1} of {phase.total}</div> : null}
      {review ? (
        <div className="notice warn stack-sm" role="alert">
          <strong>{Object.keys(review.overrides).length ? "An Owner needs to confirm these values" : "Check these values"}</strong>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{Object.values({ ...review.overrides, ...review.warnings }).map((m) => <li key={m}>{m}</li>)}</ul>
          {Object.keys(review.overrides).length ? <TextArea label="Why are these values correct?" value={reason} onChange={(e) => setReason(e.target.value)} error={errors.override} help="Saved in the audit log with your name." rows={2} /> : null}
          <div className="row-flex"><Button size="sm" variant="primary" onClick={() => save(review.status, true)}>{Object.keys(review.overrides).length ? "Confirm and save" : "Looks right, save"}</Button><Button size="sm" onClick={() => setReview(null)}>Edit</Button></div>
        </div>
      ) : null}
      <FormSummary errors={errors} />

      <fieldset className="av-section" disabled={busy || phase.kind === "upload-failed"}>
        <legend className="av-title"><span>Photos</span><span className="meta">{photos.length ? `${photos.length} of ${MAX_PHOTOS} · the first is the cover` : "Optional now · JPEG, PNG or WebP up to 8 MB"}</span></legend>
        <input ref={picker} type="file" accept={PHOTO_TYPES.join(",")} multiple hidden onChange={(e) => pick(e.target.files)} aria-label="Choose car photos" />
        <ul className="av-photos">
          {photos.map((p, i) => (
            <li key={p.url} className="av-photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Photo ${i + 1}${i === 0 ? ", cover" : ""}`} />
              {i === 0 ? <span className="av-cover">Cover</span> : <button type="button" className="av-chip" onClick={() => makeCover(i)}>Make cover</button>}
              <button type="button" className="av-remove" onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}><Icon name="close" size={14} /></button>
            </li>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <li><button type="button" className={`av-add ${photos.length ? "" : "av-add-empty"}`} onClick={() => picker.current?.click()}><Icon name="upload" size={20} /><span>{photos.length ? "Add more" : "Add photos"}</span>{photos.length ? null : <span className="meta">Front, side, interior and odometer work best</span>}</button></li>
          ) : null}
        </ul>
        {photoError ? <div className="field-error" role="alert">{photoError}</div> : null}
        {errors.photos ? <div className="field-error" role="alert">{errors.photos}</div> : null}
      </fieldset>

      <fieldset className="av-section" disabled={busy || phase.kind === "upload-failed"}>
        <legend className="av-title"><span>The car</span></legend>
        <div className="form-grid">
          <CarSelector required autoFocus value={{ make: form.make, model: form.model, variant: form.variant }} errors={{ make: errors.make, model: errors.model, variant: errors.variant }}
            onChange={(car) => { setForm((f) => ({ ...f, ...car })); setErrors((e) => { const next = { ...e }; delete next.make; delete next.model; delete next.variant; return next; }); }} />
          <TextField label="Year" required inputMode="numeric" maxLength={4} value={form.year} onChange={(e) => set("year", e.target.value)} error={errors.year} placeholder="e.g. 2022" />
          <SelectField label="Fuel" required value={form.fuel} onChange={(e) => set("fuel", e.target.value as VehicleInput["fuel"])} error={errors.fuel} options={["Petrol", "Diesel", "Hybrid", "Electric"]} placeholder="Choose" />
          <SelectField label="Gearbox" required value={form.transmission} onChange={(e) => set("transmission", e.target.value as VehicleInput["transmission"])} error={errors.transmission} options={["Manual", "Automatic"]} placeholder="Choose" />
          <TextField label="Kilometres" required inputMode="numeric" value={form.km} onChange={(e) => set("km", e.target.value)} error={errors.km} placeholder="e.g. 32,000" />
          <TextField label="Owners so far" required inputMode="numeric" value={form.owners} onChange={(e) => set("owners", e.target.value)} error={errors.owners} />
        </div>
      </fieldset>

      <fieldset className="av-section" disabled={busy || phase.kind === "upload-failed"}>
        <legend className="av-title"><span>Price and cost</span><span className="meta">Landed cost ₹{Math.round(landed / 100).toLocaleString("en-IN")}</span></legend>
        <div className="form-grid">
          <RupeeField label="Asking price" value={form.asking} onChange={(raw) => set("asking", raw)} error={errors.asking} placeholder="₹9,50,000" help="Needed to put it on sale. Later changes go through Pricing." />
          <RupeeField label="Bought for" value={form.costs.acquisition} onChange={(raw) => setCost("acquisition", raw)} error={errors["costs.acquisition"]} placeholder="₹8,00,000" help="Needed to put it on sale." />
        </div>
        <button type="button" className="link-btn av-more" aria-expanded={moreCosts} onClick={() => setMoreCosts((v) => !v)}>{moreCosts ? "Hide other costs" : "Add transport, repairs and fees"}</button>
        {moreCosts ? <div className="form-grid">{EXTRA_COSTS.map(([key, label]) => <RupeeField key={key} label={label} value={form.costs[key]} onChange={(raw) => setCost(key, raw)} error={errors[`costs.${key}`]} placeholder="₹0" />)}</div> : null}
      </fieldset>

      <fieldset className="av-section" disabled={busy || phase.kind === "upload-failed"}>
        <legend className="av-title"><span>Paperwork</span></legend>
        <div className="form-grid">
          <TextField label="Registration" value={form.registration} onChange={(e) => set("registration", e.target.value)} error={errors.registration} placeholder="e.g. KL 07 AB 1234" help="Never shown to customers." />
          <TextField label="Bought on" required type="date" value={form.acquiredOn} onChange={(e) => set("acquiredOn", e.target.value)} error={errors.acquiredOn} />
          {branches.length > 1 ? <SelectField label="Branch" required value={form.branchId} onChange={(e) => set("branchId", e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} /> : null}
        </div>
      </fieldset>
    </Drawer>
  );
}
