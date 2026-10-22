/** Schematic vehicle placeholder. Labelled as schematic: it is never presented as real photography. */
export function VehicleArt({ label = "Schematic vehicle image", ratio }: { label?: string; ratio?: string }) {
  return (
    <div className="vehicle-art" style={ratio ? { aspectRatio: ratio } : undefined} role="img" aria-label={label}>
      <svg viewBox="0 0 520 220" fill="none" aria-hidden="true">
        <path d="M36 150l12-34 88-26 64-42h128l62 40 84 18 10 44z" fill="#566178" stroke="#98a5bd" strokeWidth="2" />
        <path d="M148 98l48-34h118l44 34z" fill="#0b111c" stroke="#98a5bd" strokeWidth="2" />
        <circle cx="132" cy="152" r="30" fill="#080b12" /><circle cx="132" cy="152" r="13" fill="#9aa7bd" />
        <circle cx="388" cy="152" r="30" fill="#080b12" /><circle cx="388" cy="152" r="13" fill="#9aa7bd" />
      </svg>
      <span className="art-label">{label}</span>
    </div>
  );
}
