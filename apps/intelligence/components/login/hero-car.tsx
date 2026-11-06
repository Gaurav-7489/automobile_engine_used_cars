/**
 * Original vector illustration of a modern SUV in profile: graphite paint with an emerald sheen, tinted glass, lit LED
 * headlight, alloy wheels (the spokes turn while the cinematic scene drives) and a soft floor reflection.
 * An illustration, labelled as such; never presented as a photograph of stock.
 */
export function HeroCar({ className = "" }: { className?: string }) {
  const wheel = (cx: number, id: string) => (
    <g transform={`translate(${cx} 214)`}>
      <circle r="52" fill="url(#hc-tyre)" />
      <circle r="49" fill="none" stroke="#1d2422" strokeWidth="2" />
      <g className="hc-rim">
        <circle r="34" fill={`url(#hc-rim-${id})`} />
        {[0, 72, 144, 216, 288].map((a) => (
          <path key={a} transform={`rotate(${a})`} d="M-4.5 -8 L-7 -31 Q0 -34 7 -31 L4.5 -8 Z" fill="#c9d3d0" opacity="0.92" />
        ))}
        <circle r="34" fill="none" stroke="#e7efec" strokeOpacity="0.35" strokeWidth="1.5" />
      </g>
      <circle r="10" fill="#0f1413" stroke="#9fb0ab" strokeWidth="2" />
      <circle r="3" fill="#34d399" />
    </g>
  );
  return (
    <svg className={`hero-car ${className}`} viewBox="0 0 800 300" role="img" aria-label="Illustration of a modern SUV" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hc-paint" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b4a46" />
          <stop offset="0.38" stopColor="#1b2422" />
          <stop offset="0.62" stopColor="#101614" />
          <stop offset="1" stopColor="#060908" />
        </linearGradient>
        <linearGradient id="hc-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#34d399" stopOpacity="0" />
          <stop offset="0.55" stopColor="#6ee7b7" stopOpacity="0.28" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="hc-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#25403a" />
          <stop offset="0.5" stopColor="#0b1614" />
          <stop offset="1" stopColor="#050908" />
        </linearGradient>
        <linearGradient id="hc-glare" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="hc-tyre"><stop offset="0.62" stopColor="#151a19" /><stop offset="1" stopColor="#050606" /></radialGradient>
        {["a", "b"].map((id) => (
          <radialGradient key={id} id={`hc-rim-${id}`}><stop offset="0" stopColor="#3a4542" /><stop offset="0.8" stopColor="#1a2120" /><stop offset="1" stopColor="#5d6b67" /></radialGradient>
        ))}
        <radialGradient id="hc-head" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#f2fffb" /><stop offset="0.45" stopColor="#a7f3d0" stopOpacity="0.85" /><stop offset="1" stopColor="#34d399" stopOpacity="0" /></radialGradient>
        <radialGradient id="hc-shadow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#000" stopOpacity="0.75" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
        <linearGradient id="hc-reflect" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d399" stopOpacity="0.16" /><stop offset="1" stopColor="#34d399" stopOpacity="0" /></linearGradient>
        <clipPath id="hc-body-clip"><path d="M60 212 L118 212 A62 62 0 0 1 242 212 L538 212 A62 62 0 0 1 662 212 L740 212 Q752 210 752 194 L750 172 Q747 158 728 154 L640 142 Q598 135 552 104 L506 74 Q494 66 474 66 L214 66 Q186 66 164 82 L104 128 Q74 136 65 154 L57 190 Q55 210 60 212 Z" /></clipPath>
      </defs>

      {/* Floor shadow and reflection. */}
      <ellipse cx="400" cy="262" rx="360" ry="16" fill="url(#hc-shadow)" />
      <ellipse cx="400" cy="272" rx="330" ry="14" fill="url(#hc-reflect)" />

      {/* Body. */}
      <path d="M60 212 L118 212 A62 62 0 0 1 242 212 L538 212 A62 62 0 0 1 662 212 L740 212 Q752 210 752 194 L750 172 Q747 158 728 154 L640 142 Q598 135 552 104 L506 74 Q494 66 474 66 L214 66 Q186 66 164 82 L104 128 Q74 136 65 154 L57 190 Q55 210 60 212 Z" fill="url(#hc-paint)" stroke="#4d5d59" strokeWidth="1.2" />
      <g clipPath="url(#hc-body-clip)">
        <rect className="hc-sheen" x="-200" y="80" width="260" height="140" fill="url(#hc-sheen)" />
        <path d="M68 146 Q400 152 742 162" stroke="#9fe8cf" strokeOpacity="0.35" strokeWidth="2" fill="none" />
        <path d="M70 196 Q400 204 744 200" stroke="#000" strokeOpacity="0.5" strokeWidth="6" fill="none" />
      </g>

      {/* Glasshouse. */}
      <path d="M172 90 Q184 78 212 77 L470 77 Q486 77 498 86 L542 128 L128 134 Z" fill="url(#hc-glass)" stroke="#2f3d3a" strokeWidth="1" />
      <path d="M200 80 L282 80 L232 132 L160 133 Z" fill="url(#hc-glare)" />
      <rect x="300" y="77" width="11" height="57" fill="#121a18" />
      <rect x="424" y="77" width="9" height="54" fill="#121a18" />
      <path d="M176 72 L486 72" stroke="#a8b8b3" strokeOpacity="0.5" strokeWidth="2.5" strokeLinecap="round" />

      {/* Door shut lines and handles. */}
      <path d="M305 138 L303 206 M429 136 L434 204" stroke="#000" strokeOpacity="0.6" strokeWidth="1.5" />
      <rect x="258" y="148" width="26" height="4" rx="2" fill="#7c8a86" />
      <rect x="384" y="150" width="26" height="4" rx="2" fill="#7c8a86" />

      {/* Lights. */}
      <circle className="hc-headglow" cx="736" cy="160" r="46" fill="url(#hc-head)" />
      <path d="M698 151 L744 158 L746 169 L705 164 Z" fill="#effffa" />
      <path d="M60 146 L86 143 L84 164 L58 165 Z" fill="#ff4d5e" />
      <path d="M61 148 L82 146" stroke="#ffd1d6" strokeWidth="1.5" />

      {wheel(180, "a")}
      {wheel(600, "b")}
    </svg>
  );
}
