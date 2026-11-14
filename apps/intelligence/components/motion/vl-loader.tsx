/**
 * The Vandlabs loading mark: the letters VL with a light sweeping across them and the wordmark underneath. Decorative only;
 * the container that shows it carries the role="status" and the words a screen reader hears.
 */
export function VLMark({ size = "md", label = "Vandlabs" }: { size?: "sm" | "md" | "lg"; label?: string | null }) {
  return (
    <span className={`vl-mark vl-${size}`} aria-hidden="true">
      <span className="vl-letters">VL</span>
      {label ? <span className="vl-word">{label}</span> : null}
    </span>
  );
}
