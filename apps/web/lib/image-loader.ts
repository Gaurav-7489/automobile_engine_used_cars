import type { ImageLoaderProps } from "next/image";
/** Unsplash source-side resizing avoids an extra paid image transformation service.
 * R2 photos are compressed before upload and served unchanged by the media route. */
export default function imageLoader({src,width,quality}:ImageLoaderProps) {
  try {const url=new URL(src);if(url.protocol==="https:"&&url.hostname==="images.unsplash.com") {url.searchParams.set("w",String(Math.min(width,1920)));url.searchParams.set("q",String(quality ?? 75));url.searchParams.set("auto","format");url.searchParams.set("fit","max");return url.toString();}}catch{/* Same-origin images already use compressed files. */}
  return src;
}
