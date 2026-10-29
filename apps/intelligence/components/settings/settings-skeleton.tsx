import { Skeleton } from "../ui";

const SECTION_COUNT = 9;

/** A form card: heading, helper line, labelled fields in two columns, and the action row, in the proportions of the real forms. */
export function FormSkeleton({ fields = 4, title = "Loading form" }: { fields?: number; title?: string }) {
  return (
    <section className="card stack" role="status" aria-busy="true" aria-label={`${title}…`}>
      <Skeleton h={22} w="34%" />
      <Skeleton h={14} w="62%" />
      <div className="form-grid" style={{ marginTop: 8 }}>
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="stack-sm"><Skeleton h={12} w={`${34 + ((i * 13) % 24)}%`} /><Skeleton h={44} /></div>
        ))}
      </div>
      <div className="row-flex" style={{ marginTop: 8 }}><Skeleton h={44} w={132} /><Skeleton h={44} w={96} /></div>
    </section>
  );
}

/** A list card: heading and rows with a title line, a meta line and a trailing action. */
export function ListSkeleton({ rows = 4, title = "Loading list" }: { rows?: number; title?: string }) {
  return (
    <section className="card stack" role="status" aria-busy="true" aria-label={`${title}…`}>
      <div className="spread"><Skeleton h={22} w="28%" /><Skeleton h={40} w={120} /></div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="spread" style={{ alignItems: "center", gap: 16 }}>
          <div className="stack-sm" style={{ flex: 1 }}><Skeleton h={16} w={`${46 + ((i * 11) % 30)}%`} /><Skeleton h={12} w={`${30 + ((i * 7) % 25)}%`} /></div>
          <Skeleton h={32} w={72} />
        </div>
      ))}
    </section>
  );
}

/** The whole settings page while its section loads: page head, the section list and a form card, so nothing moves when the real page arrives. */
export function SettingsSkeleton() {
  return (
    <div className="page" role="status" aria-busy="true" aria-label="Loading settings…">
      <div className="goo-field" aria-hidden="true"><i /><i /><i /></div>
      <div className="stack-sm"><Skeleton h={34} w={300} /><Skeleton h={14} w={420} /></div>
      <div className="settings-grid">
        <div className="settings-nav only-desktop" aria-hidden="true">
          {Array.from({ length: SECTION_COUNT }, (_, i) => <Skeleton key={i} h={44} w={`${70 + ((i * 9) % 26)}%`} />)}
        </div>
        <div className="settings-content stack">
          <FormSkeleton fields={4} title="Loading section" />
          <ListSkeleton rows={3} title="Loading details" />
        </div>
      </div>
      <span className="sr-only">Loading settings…</span>
    </div>
  );
}
