export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 5h6.200l6.800 15.500L22.800 5H29l-9.500 22h-7z" fill="var(--text)" />
      <path d="M15.500 20.800h13.500v4.700H17.500z" fill="var(--accent)" />
    </svg>
  );
}

export function Brand({ sub = true, href }: { sub?: boolean; href?: string }) {
  const inner = (
    <>
      <BrandMark />
      <span className="brand-text">
        <span className="brand-name">VANDLABS</span>
      </span>
      {sub ? <span className="brand-sub">Automotive Intelligence</span> : null}
    </>
  );
  return href ? <a className="brand" href={href} aria-label="VandLabs home">{inner}</a> : <span className="brand">{inner}</span>;
}
