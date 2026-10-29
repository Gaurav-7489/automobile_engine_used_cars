"use client";

import { useState } from "react";
import type { AcquisitionReport } from "@vandlabs/contracts";
import { call } from "../admin/shared";
import { RemotePanel } from "../panel";
import { Badge, Button, EmptyState, FormSummary, Notice, PageHead, SelectField, TextField } from "../ui";
import { useRemote } from "../use-remote";
import type { AcquisitionOverview } from "@/lib/server/acquisition-store";
import { formatShortDateTime } from "@/lib/format";

const money = (v: number | null) => (v === null ? "Unknown" : `₹${v.toLocaleString("en-IN")}`);
type Report = AcquisitionReport & { usage: { monthlyUsed: number; monthlyLimit: number } };
const NUMERIC: { key: string; label: string; min: number; max: number; integer?: boolean; help?: string }[] = [
  { key: "budget", label: "Available capital (₹)", min: 1, max: 100_000_000, integer: true },
  { key: "reserve", label: "Cash reserve (₹)", min: 0, max: 100_000_000, integer: true, help: "Kept back from the budget." },
  { key: "latitude", label: "Dealership latitude", min: -90, max: 90 },
  { key: "longitude", label: "Dealership longitude", min: -180, max: 180 },
  { key: "radiusKm", label: "Search radius (km)", min: 0, max: 3000 },
  { key: "transportPerKm", label: "Transport assumption (₹ per km)", min: 0, max: 1000 },
  { key: "dailyHoldingCost", label: "Daily holding cost (₹)", min: 0, max: 10_000 },
  { key: "holdingDays", label: "Expected holding days", min: 0, max: 365, integer: true },
  { key: "annualKm", label: "Customer annual driving (km)", min: 0, max: 200_000, integer: true },
];
const DEFAULTS: Record<string, string> = { budget: "1000000", reserve: "50000", latitude: "9.9312", longitude: "76.2673", radiusKm: "600", transportPerKm: "20", dailyHoldingCost: "100", holdingDays: "30", annualKm: "12000" };

export function AcquisitionPage() {
  const remote = useRemote<AcquisitionOverview>("/api/acquisition");
  const [values, setValues] = useState(DEFAULTS);
  const [city, setCity] = useState("Kochi"), [count, setCount] = useState("1"), [goal, setGoal] = useState("margin"), [fuel, setFuel] = useState("any");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const run = async () => {
    const found: Record<string, string> = {};
    const body: Record<string, unknown> = { city: city.trim(), count: Number(count), goal, fuel };
    if (!city.trim()) found.city = "Enter the dealership city.";
    for (const f of NUMERIC) {
      const raw = values[f.key]?.trim() ?? "", n = Number(raw);
      if (raw === "" || !Number.isFinite(n) || n < f.min || n > f.max || (f.integer && !Number.isInteger(n))) found[f.key] = `Enter ${f.integer ? "a whole number" : "a number"} from ${f.min.toLocaleString("en-IN")} to ${f.max.toLocaleString("en-IN")}.`;
      body[f.key] = n;
    }
    if (!found.reserve && !found.budget && Number(values.reserve) > Number(values.budget)) found.reserve = "The reserve cannot exceed the capital.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true); setReport(null);
    const r = await call<Report>("/api/acquisition", { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { setReport(r.data); remote.reload(); } else setErrors({ form: r.data.error?.message ?? "The calculation failed. Try again." });
  };

  const o = remote.data;
  return (
    <div className="page">
      <PageHead title="Acquisition research" lead="Which cars to buy next, from your approved sourcing data, within your capital and reserve. Missing facts stay unknown; confirm condition and quotations before buying." />
      <RemotePanel title="Acquisition research" remote={remote} rows={4}>
        {o ? (
          <>
            <Notice tone={o.subscription?.status === "active" ? "accent" : "warn"} role="status">
              {o.subscription ? <>Plan <strong>{o.subscription.plan}</strong>, {o.subscription.status}, valid until {formatShortDateTime(o.subscription.expiresAt)}.{o.usage ? ` ${o.usage.monthlyUsed.toLocaleString("en-IN")} of ${o.usage.monthlyLimit.toLocaleString("en-IN")} calculations used this month.` : ""}</> : "No subscription is recorded for this dealership."}
              {o.demo ? " Sourcing data includes fictional demonstration records." : ""}
            </Notice>
            <section className="card stack" aria-labelledby="aq-h">
              <h2 className="h2" id="aq-h">Constraints</h2>
              <FormSummary errors={errors.form ? { form: errors.form } : {}} />
              <div className="form-grid">
                <TextField label="Dealership city" value={city} onChange={(e) => setCity(e.target.value)} error={errors.city} />
                {NUMERIC.map((f) => <TextField key={f.key} label={f.label} inputMode="decimal" value={values[f.key]} help={f.help} error={errors[f.key]} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />)}
                <SelectField label="Cars to buy" value={count} onChange={(e) => setCount(e.target.value)} options={[{ value: "1", label: "One car" }, { value: "2", label: "Two cars (Growth or Scale)", disabled: o.subscription?.plan === "starter" }]} />
                <SelectField label="Rank by" value={goal} onChange={(e) => setGoal(e.target.value)} options={[{ value: "margin", label: "Estimated gross contribution" }, { value: "demand", label: "Source demand score" }]} />
                <SelectField label="Fuel" value={fuel} onChange={(e) => setFuel(e.target.value)} options={["any", "petrol", "diesel", "hybrid", "electric"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} />
              </div>
              <div className="row-flex"><Button variant="primary" loading={busy} loadingLabel="Calculating…" onClick={run}>Find budget-fit acquisitions</Button></div>
            </section>
            {report ? (
              <section className="card stack" aria-labelledby="aqr-h" aria-live="polite">
                <h2 className="h2" id="aqr-h">Budget-fit options</h2>
                <p className="muted">{report.candidates} eligible sourcing vehicles. {report.usage.monthlyUsed} of {report.usage.monthlyLimit} calculations used this month.</p>
                {!report.options.length ? <EmptyState title="Nothing fits these constraints">Change the budget, reserve, radius or strategy, or ask VandLabs to connect a feed with suitable stock.</EmptyState> : report.options.map((option, i) => (
                  <article key={option.cars.map((c) => c.id).join("+")} className="card stack-sm">
                    <p className="meta">{i === 0 ? "Top fit for your objective" : `Alternative ${i}`}{report.demo ? " (fictional example)" : ""}</p>
                    <h3 className="h3">{option.cars.map((c) => `${c.year} ${c.make} ${c.model}`).join(" + ")}</h3>
                    {option.cars.map((car) => <p key={car.id} className="meta">{car.city}, {car.state} / {car.distanceKm.toFixed(0)} km straight-line / {car.fuel} / {car.odometerKm.toLocaleString("en-IN")} km. Purchase {money(car.purchasePrice)}, preparation {money(car.preparationCost)}, transfer {money(car.transferFees)}, transport {money(car.transportEstimate)}. Customer annual fuel {money(car.annualFuelEstimate)}. Source {car.sourceId}, observed {car.observedAt.slice(0, 10)}.</p>)}
                    <dl className="kv">
                      <dt>Landed plus holding</dt><dd>{money(option.landedCost)}</dd>
                      <dt>Gross contribution range</dt><dd>{money(option.marginLow)} to {money(option.marginHigh)}</dd>
                      <dt>Left after reserve</dt><dd>{money(option.remaining)}</dd>
                      <dt>Demand score</dt><dd>{option.demandScore === null ? "Unknown" : `${option.demandScore} / 100`}</dd>
                    </dl>
                    <p className="muted">{option.explanation}</p>
                  </article>))}
                {report.notices.map((n) => <Notice key={n}>{n}</Notice>)}
              </section>
            ) : null}
            <section className="card stack" aria-labelledby="src-h">
              <h2 className="h2" id="src-h">Approved sourcing data</h2>
              {!o.sources.length ? <EmptyState title="No sources connected">VandLabs connects licensed sourcing feeds for your dealership. Until then there is nothing to research.</EmptyState> : (
                <div className="table-wrap"><table className="data-table dense"><caption className="sr-only">Sourcing data sources</caption><thead><tr><th>Source</th><th>Type</th><th>Status</th><th>Records</th><th>Available</th><th>Latest</th></tr></thead>
                  <tbody>{o.sources.map((s) => <tr key={s.id}><td>{s.name}</td><td>{s.kind}</td><td>{s.enabled && Date.parse(s.expiresAt) > Date.now() ? <Badge tone="accent">In use</Badge> : <Badge tone="warn">Not in use</Badge>}</td><td>{s.records}</td><td>{s.available}</td><td>{s.latest ? formatShortDateTime(s.latest) : "—"}</td></tr>)}</tbody></table></div>
              )}
            </section>
          </>
        ) : null}
      </RemotePanel>
    </div>
  );
}
