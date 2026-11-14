"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CATALOG, canonicalBrand, canonicalModel, canonicalVariant, modelsOf, variantsOf } from "@/lib/car-catalog/catalog";

export type CarPick = { make: string; model: string; variant: string };

type Props = {
  value: CarPick;
  onChange: (next: CarPick) => void;
  /** "form": choosing a car (all three asked for). "filter": narrowing a search (each level may stay "Any"). */
  mode?: "form" | "filter";
  errors?: Partial<Record<keyof CarPick, string>>;
  required?: boolean;
  disabled?: boolean;
  /** Names for hidden inputs, so the choice submits with a plain HTML form (public showroom filters). */
  names?: Partial<Record<keyof CarPick, string>>;
  /** Limit brands, e.g. to makes a dealer actually has. Catalogue order is kept. */
  brands?: string[];
  autoFocus?: boolean;
  /** Brand and model can be fixed (editing a saved car keeps its identity) while the variant stays editable. */
  lockMakeAndModel?: boolean;
};

/**
 * The universal car selector: Brand, then Model, then Variant. Each field unlocks once the one before it is chosen, and
 * changing a brand clears the model and variant below it. Every field is searchable as you type. A car the catalogue does
 * not list can still be entered: the typed text is offered as its own choice.
 */
export function CarSelector({ value, onChange, mode = "form", errors = {}, required, disabled, names, brands, autoFocus, lockMakeAndModel }: Props) {
  const brandList = useMemo(() => {
    if (!brands?.length) return CATALOG.brands;
    const wanted = new Set(brands.map((b) => canonicalBrand(b)));
    const known = CATALOG.brands.filter((b) => wanted.has(b));
    return [...known, ...[...wanted].filter((b) => !CATALOG.brands.includes(b)).sort()];
  }, [brands]);
  const models = value.make ? modelsOf(value.make) : [];
  const variants = value.make && value.model ? variantsOf(value.make, value.model) : [];
  const filter = mode === "filter";
  return (
    <div className="car-selector" data-mode={mode}>
      <Combo label="Brand" placeholder={filter ? "Any brand" : "Search brands"} options={brandList} value={value.make} required={required} disabled={disabled || lockMakeAndModel} error={errors.make}
        allowCustom={!filter} clearLabel={filter ? "Any brand" : undefined} autoFocus={autoFocus} name={names?.make}
        onPick={(make) => onChange({ make: make ? canonicalBrand(make) : "", model: "", variant: "" })} />
      <Combo label="Model" placeholder={!value.make ? "Choose a brand first" : filter ? "Any model" : "Search models"} options={models} value={value.model} required={required}
        disabled={disabled || lockMakeAndModel || !value.make} error={errors.model} allowCustom={!filter} clearLabel={filter ? "Any model" : undefined} name={names?.model}
        onPick={(model) => onChange({ ...value, model: model ? canonicalModel(value.make, model) : "", variant: "" })} />
      <Combo label="Variant" placeholder={!value.model ? "Choose a model first" : filter ? "Any variant" : variants.length ? "Search variants" : "Type the variant"} options={variants} value={value.variant}
        required={required} disabled={disabled || !value.model} error={errors.variant} allowCustom={!filter} clearLabel={filter ? "Any variant" : undefined} name={names?.variant}
        onPick={(variant) => onChange({ ...value, variant: variant ? canonicalVariant(value.make, value.model, variant) : "" })} />
    </div>
  );
}

type ComboProps = {
  label: string; placeholder: string; options: string[]; value: string; onPick: (v: string) => void;
  required?: boolean; disabled?: boolean; error?: string; allowCustom: boolean; clearLabel?: string; autoFocus?: boolean; name?: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[\s-]+/g, " ").trim();

function Combo({ label, placeholder, options, value, onPick, required, disabled, error, allowCustom, clearLabel, autoFocus, name }: ComboProps) {
  const id = useId();
  const listId = `${id}-list`;
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // Follow the chosen value when it changes from outside (a brand change clears the model).
  useEffect(() => { setText(value); }, [value]);

  const query = norm(text === value ? "" : text);
  const matches = useMemo(() => {
    if (!query) return options;
    const starts = options.filter((o) => norm(o).startsWith(query));
    const contains = options.filter((o) => !norm(o).startsWith(query) && norm(o).includes(query));
    return [...starts, ...contains];
  }, [options, query]);
  const custom = allowCustom && query && !options.some((o) => norm(o) === query) ? text.trim().slice(0, 40) : "";
  const rows: { value: string; label: string; kind: "clear" | "option" | "custom" }[] = [
    ...(clearLabel && value ? [{ value: "", label: clearLabel, kind: "clear" as const }] : []),
    ...matches.slice(0, 80).map((o) => ({ value: o, label: o, kind: "option" as const })),
    ...(custom ? [{ value: custom, label: `Use “${custom}”`, kind: "custom" as const }] : []),
  ];

  useEffect(() => { setActive(0); }, [query, open]);
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active, open]);

  const choose = (v: string) => { onPick(v); setText(v); setOpen(false); };
  const close = () => { setOpen(false); setText(value); };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (!open) setOpen(true); else setActive((a) => Math.min(rows.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && open) { e.preventDefault(); const row = rows[active]; if (row) choose(row.value); }
    else if (e.key === "Escape" && open) { e.preventDefault(); close(); }
    else if (e.key === "Tab" && open) { const exact = rows.find((r) => r.kind === "option" && norm(r.value) === query); if (exact) choose(exact.value); else close(); }
  };

  const describedBy = [error ? `${id}-error` : "", `${id}-hint`].filter(Boolean).join(" ");
  return (
    <div className={`field car-combo ${disabled ? "is-locked" : ""}`}>
      <label htmlFor={id}>{label}{required ? <span className="req" aria-hidden="true"> *</span> : null}{required ? <span className="sr-only"> (required)</span> : null}</label>
      <div className="car-combo-box">
        <input ref={input} id={id} className="input" role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined} aria-invalid={error ? true : undefined} aria-describedby={describedBy}
          autoComplete="off" spellCheck={false} placeholder={placeholder} value={text} disabled={disabled} autoFocus={autoFocus}
          onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onClick={() => setOpen(true)} onKeyDown={onKeyDown}
          onBlur={(e) => { if (!e.relatedTarget || !list.current?.contains(e.relatedTarget as Node)) close(); }} />
        <span className="car-combo-caret" aria-hidden="true" />
        {open && !disabled ? (
          <ul ref={list} id={listId} role="listbox" aria-label={label} className="car-combo-list">
            {rows.length ? rows.map((r, i) => (
              <li key={`${r.kind}-${r.value}`} id={`${listId}-${i}`} data-index={i} role="option" aria-selected={i === active} tabIndex={-1}
                className={`car-combo-opt ${r.kind !== "option" ? `is-${r.kind}` : ""} ${r.value === value && r.kind === "option" ? "is-chosen" : ""}`}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r.value)}>
                {r.label}
              </li>
            )) : <li className="car-combo-empty" role="presentation">No match. Check the spelling.</li>}
          </ul>
        ) : null}
      </div>
      <span id={`${id}-hint`} className="sr-only">Type to search, then use the arrow keys and Enter to choose.</span>
      {error ? <div className="field-error" id={`${id}-error`} role="alert">{error}</div> : null}
      {name ? <input type="hidden" name={name} value={value} /> : null}
    </div>
  );
}
