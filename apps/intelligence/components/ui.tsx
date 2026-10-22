"use client";

import Link from "next/link";
import { useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Icon } from "./icons";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  loadingLabel?: string;
  /** Disabled controls explain themselves. */
  reason?: string;
  size?: "md" | "sm";
};

export function Button({ variant = "secondary", loading, loadingLabel, reason, size = "md", className = "", children, disabled, ...rest }: ButtonProps) {
  const id = useId();
  const classes = `btn ${variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : variant === "ghost" ? "btn-ghost" : ""} ${size === "sm" ? "btn-sm" : ""} ${className}`;
  const blocked = Boolean(disabled || loading);
  return (
    <>
      <button type="button" {...rest} className={classes} disabled={disabled && !reason ? true : undefined} aria-disabled={blocked || undefined} aria-busy={loading || undefined} aria-describedby={reason ? id : rest["aria-describedby"]}
        onClick={(event) => { if (blocked) { event.preventDefault(); return; } rest.onClick?.(event); }}>
        {loading ? <><span className="spinner" aria-hidden="true" /><span>{loadingLabel ?? children}</span></> : children}
      </button>
      {reason && disabled ? <span id={id} className="disabled-reason" role="note">{reason}</span> : null}
    </>
  );
}

export function LinkButton({ href, variant = "secondary", children, className = "", ...rest }: { href: string; variant?: "primary" | "secondary" | "ghost"; children: ReactNode; className?: string } & Omit<React.ComponentProps<typeof Link>, "href">) {
  return <Link href={href} className={`btn ${variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : ""} ${className}`} {...rest}>{children}</Link>;
}

type FieldShell = { label: string; help?: string; error?: string; required?: boolean; className?: string };

export function Field({ label, help, error, required, className = "", children, htmlFor }: FieldShell & { children: ReactNode; htmlFor: string }) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={htmlFor}>{label}{required ? <span className="req" aria-hidden="true"> *</span> : null}{required ? <span className="sr-only"> (required)</span> : null}</label>
      {children}
      {help ? <div className="help" id={`${htmlFor}-help`}>{help}</div> : null}
      {error ? <div className="field-error" id={`${htmlFor}-error`} role="alert">{error}</div> : null}
    </div>
  );
}

export function TextField({ label, help, error, required, className, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const id = rest.id ?? generated;
  const describedBy = [help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <Field label={label} help={help} error={error} required={required} htmlFor={id} className={className}>
      <input {...rest} id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} />
    </Field>
  );
}

export function SelectField({ label, help, error, required, className, options, placeholder, ...rest }: FieldShell & SelectHTMLAttributes<HTMLSelectElement> & { options: readonly { value: string; label: string; disabled?: boolean }[] | readonly string[]; placeholder?: string }) {
  const generated = useId();
  const id = rest.id ?? generated;
  const describedBy = [help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <Field label={label} help={help} error={error} required={required} htmlFor={id} className={className}>
      <select {...rest} id={id} className="select" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (typeof option === "string" ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>))}
      </select>
    </Field>
  );
}

export function TextArea({ label, help, error, required, className, ...rest }: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const generated = useId();
  const id = rest.id ?? generated;
  const describedBy = [help ? `${id}-help` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <Field label={label} help={help} error={error} required={required} htmlFor={id} className={className}>
      <textarea {...rest} id={id} className="textarea" aria-invalid={error ? true : undefined} aria-describedby={describedBy} required={required} />
    </Field>
  );
}

export function PasswordField({ label, error, help, ...rest }: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const [shown, setShown] = useState(false);
  const generated = useId();
  const id = rest.id ?? generated;
  return (
    <Field label={label} help={help} error={error} htmlFor={id}>
      <div className="input-affix">
        <input {...rest} id={id} type={shown ? "text" : "password"} className="input" style={{ paddingRight: 72 }} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
        <button type="button" className="btn btn-ghost affix-btn btn-sm accent-text" onClick={() => setShown((v) => !v)} aria-pressed={shown}>{shown ? "Hide" : "Show"}<span className="sr-only"> password</span></button>
      </div>
    </Field>
  );
}

export function Check({ label, checked, onChange, help, disabled, id }: { label: ReactNode; checked: boolean; onChange: (value: boolean) => void; help?: string; disabled?: boolean; id?: string }) {
  const generated = useId();
  return (
    <label className="check" htmlFor={id ?? generated}>
      <input id={id ?? generated} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}{help ? <span className="help" style={{ display: "block" }}>{help}</span> : null}</span>
    </label>
  );
}

export function Badge({ tone = "neutral", children, outline }: { tone?: "neutral" | "accent" | "warn" | "danger" | "info"; children: ReactNode; outline?: boolean }) {
  return <span className={`badge ${tone === "neutral" ? "" : tone} ${outline ? "badge-outline" : ""}`}>{children}</span>;
}

export function Notice({ tone = "neutral", children, role }: { tone?: "neutral" | "warn" | "danger" | "accent"; children: ReactNode; role?: "alert" | "status" }) {
  return <div className={`notice ${tone === "neutral" ? "" : tone}`} role={role}>{children}</div>;
}

export function Kpi({ label, value, note, tone = "accent", href, onClick, info }: { label: string; value: ReactNode; note?: ReactNode; tone?: "accent" | "warn" | "neutral"; href?: string; onClick?: () => void; info?: ReactNode }) {
  const body = (
    <>
      <span className="kpi-label"><span>{label}</span></span>
      <span className="kpi-value">{value}</span>
      {note ? <span className={`kpi-note ${tone === "warn" ? "warn" : tone === "neutral" ? "neutral" : ""}`}>{note}</span> : <span />}
    </>
  );
  // The info affordance sits beside, not inside, the interactive element: buttons and links cannot nest.
  const inner = href ? <Link href={href} className="kpi-main">{body}</Link> : onClick ? <button type="button" className="kpi-main" onClick={onClick}>{body}</button> : <div className="kpi-main">{body}</div>;
  return <div className={`kpi ${href || onClick ? "kpi-action" : ""}`}>{inner}{info ? <span className="kpi-info">{info}</span> : null}</div>;
}

export function Tabs<T extends string>({ tabs, value, onChange, label, idPrefix = "tab" }: { tabs: readonly { value: T; label: string; count?: number }[]; value: T; onChange: (value: T) => void; label: string; idPrefix?: string }) {
  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex((t) => t.value === value);
    const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : event.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    onChange(tabs[next].value);
    window.setTimeout(() => document.getElementById(`${idPrefix}-${tabs[next].value}`)?.focus(), 0);
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" id={`${idPrefix}-${t.value}`} className="tab" aria-selected={t.value === value} tabIndex={t.value === value ? 0 : -1} onClick={() => onChange(t.value)}>
          {t.label}{t.count !== undefined ? ` (${t.count})` : ""}
        </button>
      ))}
    </div>
  );
}

export function PageHead({ title, lead, actions, children }: { title: string; lead?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1 className="h1" id="page-title" tabIndex={-1}>{title}</h1>
        {lead ? <p className="lead">{lead}</p> : null}
        {children}
      </div>
      {actions ? <div className="row-flex">{actions}</div> : null}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", className = "" }: { h?: number; w?: number | string; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w }} aria-hidden="true" />;
}

export function PanelSkeleton({ rows = 3, title = "Loading" }: { rows?: number; title?: string }) {
  return (
    <div className="card" role="status" aria-label={`${title}…`} aria-busy="true">
      <Skeleton h={20} w="40%" />
      <div className="stack" style={{ marginTop: 20 }}>{Array.from({ length: rows }, (_, i) => <Skeleton key={i} h={i === 0 ? 40 : 16} w={`${100 - i * 8}%`} />)}</div>
    </div>
  );
}

export function EmptyState({ title, children, actions, center }: { title: string; children?: ReactNode; actions?: ReactNode; center?: boolean }) {
  return (
    <div className={`state-box ${center ? "center" : ""}`}>
      <h3 className="h3">{title}</h3>
      {children ? <p className="muted" style={{ maxWidth: 560 }}>{children}</p> : null}
      {actions ? <div className="actions">{actions}</div> : null}
    </div>
  );
}

export function ErrorPanel({ title = "This panel could not load", message, onRetry, partial }: { title?: string; message?: string; onRetry?: () => void; partial?: boolean }) {
  return (
    <div className="state-box" role="alert" style={{ borderColor: "rgba(255,138,128,0.5)" }}>
      <div className="row-flex">{partial ? <Badge tone="warn">Incomplete</Badge> : null}<h3 className="h3">{title}</h3></div>
      <p className="muted">{message ?? "Other panels on this page are still showing their last successful data. Totals that depend on this panel are marked Incomplete and never shown as zero."}</p>
      {onRetry ? <div className="actions"><Button onClick={onRetry}><Icon name="refresh" size={16} />Retry</Button></div> : null}
    </div>
  );
}

export function FormSummary({ errors, label = "Fix these to continue:" }: { errors: Record<string, string>; label?: string }) {
  const entries = Object.entries(errors);
  if (!entries.length) return null;
  return (
    <div className="form-summary" role="alert">
      <strong>{label}</strong>
      <ul>{entries.map(([key, message]) => <li key={key}>{message}</li>)}</ul>
    </div>
  );
}

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" className="btn-ghost" aria-label={label} aria-expanded={open} aria-controls={id} onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }} onBlur={() => setOpen(false)} style={{ background: "none", border: 0, color: "var(--muted)", padding: 0, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Icon name="info" size={16} />
      </button>
      {open ? <span id={id} role="tooltip" className="chart-tooltip" style={{ right: 0, top: "100%", whiteSpace: "normal", width: 260 }}>{children}</span> : null}
    </span>
  );
}

const grouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/** Indian-grouped rupee input: shows ₹25,90,000 at rest and the raw number while editing. The value is a plain rupee string. */
export function RupeeField({ label, value, onChange, help, error, required, disabled, hideLabel, className, placeholder, align = "left" }: {
  label: string; value: string; onChange: (raw: string) => void; help?: string; error?: string; required?: boolean; disabled?: boolean; hideLabel?: boolean; className?: string; placeholder?: string; align?: "left" | "right";
}) {
  const generated = useId();
  const [focused, setFocused] = useState(false);
  const cleaned = value.replace(/[₹,\s]/g, "");
  const valid = /^\d+(\.\d{1,2})?$/.test(cleaned);
  const shown = focused || !valid ? value : `₹${grouping.format(Number(cleaned))}`;
  const describedBy = [help ? `${generated}-help` : "", error ? `${generated}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${className ?? ""}`}>
      <label htmlFor={generated} className={hideLabel ? "sr-only" : undefined}>{label}{required ? <span className="req" aria-hidden="true"> *</span> : null}{required ? <span className="sr-only"> (required)</span> : null}</label>
      <input id={generated} className="input" inputMode="decimal" autoComplete="off" value={shown} placeholder={placeholder} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={describedBy} style={align === "right" ? { textAlign: "right" } : undefined}
        onFocus={(e) => { setFocused(true); const el = e.currentTarget; window.setTimeout(() => el.select(), 0); }} onBlur={() => setFocused(false)} onChange={(e) => onChange(e.target.value.replace(/[₹\s]/g, "").replace(/,/g, ""))} />
      {help ? <div className="help" id={`${generated}-help`}>{help}</div> : null}
      {error ? <div className="field-error" id={`${generated}-error`} role="alert">{error}</div> : null}
    </div>
  );
}
