"use client";

import { useState } from "react";
import { Button, Check, SelectField, TextArea, TextField } from "../ui";

type Errors = Record<string, string>;

/** Customer enquiry on a public vehicle page. Creates a lead for the dealership; tracking tags from the link are passed along. */
export function EnquiryForm({ tenant, stock, title, dealer }: { tenant: string; stock: string; title: string; dealer: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [intent, setIntent] = useState("call");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [trap, setTrap] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [failure, setFailure] = useState("");

  const clear = (key: string) => setErrors((e) => { if (!e[key]) return e; const next = { ...e }; delete next[key]; return next; });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFailure("");
    const local: Errors = {};
    if (name.trim().length < 2) local.name = "Enter your name.";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) local.phone = "Enter a 10-digit mobile number.";
    if (!consent) local.consent = "Please allow the dealership to contact you about this car.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setSending(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const response = await fetch("/api/public/enquiry", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenant, stock, name, phone, intent, message, consent, marketing, website: trap, utmSource: params.get("utm_source") ?? "", utmCampaign: params.get("utm_campaign") ?? "" }),
      });
      const body = (await response.json().catch(() => null)) as { ok?: boolean; reference?: string; error?: { message?: string; fields?: Errors } } | null;
      if (response.ok && body?.ok) { setDone(body.reference ?? "received"); return; }
      if (body?.error?.fields) setErrors(body.error.fields);
      setFailure(body?.error?.message ?? "We could not send your enquiry. Please try again or call the dealership.");
    } catch {
      setFailure("You seem to be offline. Please try again or call the dealership.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <section className="card pl-enquiry" aria-live="polite">
        <h2 className="h3">Thank you, {name.split(" ")[0]}</h2>
        <p>Your enquiry about the {title} has reached {dealer || "the dealership"}. They will contact you on {phone}.</p>
        <p className="meta">Reference {done}</p>
      </section>
    );
  }

  return (
    <form className="card pl-enquiry stack" onSubmit={submit} noValidate aria-labelledby="enquiry-title">
      <div><h2 className="h3" id="enquiry-title">Interested in this car?</h2><p className="meta">Leave your number and {dealer || "the dealership"} will get back to you.</p></div>
      <TextField label="Your name" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); clear("name"); }} error={errors.name} required maxLength={80} />
      <TextField label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(e) => { setPhone(e.target.value); clear("phone"); }} error={errors.phone} required maxLength={20} />
      <SelectField label="I would like" value={intent} onChange={(e) => setIntent(e.target.value)} options={[{ value: "call", label: "A call back" }, { value: "whatsapp", label: "A WhatsApp message" }, { value: "test-drive", label: "A test drive" }, { value: "price", label: "Price and finance details" }]} />
      <TextArea label="Message (optional)" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} placeholder="Is this car still available?" />
      <div className="pl-trap" aria-hidden="true"><label>Website<input tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} /></label></div>
      <Check label={`${dealer || "The dealership"} may contact me about this car`} checked={consent} onChange={(v) => { setConsent(v); clear("consent"); }} />
      {errors.consent ? <div className="field-error" role="alert">{errors.consent}</div> : null}
      <Check label="Also send me offers on similar cars (optional)" checked={marketing} onChange={setMarketing} />
      {failure ? <div className="field-error" role="alert">{failure}</div> : null}
      <Button variant="primary" type="submit" loading={sending} loadingLabel="Sending…">Send enquiry</Button>
    </form>
  );
}
