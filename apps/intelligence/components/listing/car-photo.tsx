"use client";

import { useEffect, useRef, useState } from "react";

/** A listing photo that falls back to a quiet label when the image cannot load, instead of a broken-image icon. */
export function CarPhoto({ src, alt, eager = false }: { src: string | null; alt: string; eager?: boolean }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // An image can fail before the page becomes interactive, when onError is not yet attached: check once on mount.
  useEffect(() => { const img = ref.current; if (img && img.complete && img.naturalWidth === 0) setFailed(true); }, []);
  if (!src || failed) return <span className="meta pl-photo-missing">{src ? "Photo unavailable" : "Photos coming soon"}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt={alt} loading={eager ? "eager" : "lazy"} onError={() => setFailed(true)} />;
}
