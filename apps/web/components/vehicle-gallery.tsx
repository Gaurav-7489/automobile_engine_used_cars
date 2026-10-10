"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import type { VehicleMedia } from "@vandlabs/contracts";
export function VehicleGallery({ media, label, availability }: { media: VehicleMedia[]; label: string; availability: string }) {
  const [index, setIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const current = media[index] ?? media[0];
  return <div className="vehicle-gallery"><div className="gallery-photo">{current ? <Image key={current.url} src={current.url} alt={current.alt || label} fill priority sizes="(max-width: 960px) 100vw, 60vw" className="gallery-image" unoptimized={!current.url.startsWith("https://images.unsplash.com/")} /> : <span>Vehicle photography pending</span>}<span className={`availability ${availability}`}>{availability}</span>{current && <button type="button" className="gallery-expand" onClick={() => dialog.current?.showModal()}>Expand image ↗</button>}<span className="gallery-count">{media.length ? index + 1 : 0} / {media.length}</span></div>{media.length > 1 && <div className="gallery-thumbnails" role="group" aria-label="Vehicle photographs">{media.map((item, i) => <button key={`${item.url}-${i}`} type="button" aria-label={`View photo ${i + 1}`} aria-pressed={index === i} onClick={() => setIndex(i)}><Image src={item.url} alt="" fill sizes="100px" style={{ objectFit: "cover" }} unoptimized={!item.url.startsWith("https://images.unsplash.com/")} /></button>)}</div>}<dialog className="image-dialog" ref={dialog} aria-label={`${label} photograph`}><button className="dialog-close" type="button" onClick={() => dialog.current?.close()} aria-label="Close photograph">×</button><div className="dialog-photo">{current && <Image src={current.url} alt={current.alt || label} fill sizes="95vw" style={{ objectFit: "contain" }} unoptimized={!current.url.startsWith("https://images.unsplash.com/")} />}</div></dialog></div>;
}
