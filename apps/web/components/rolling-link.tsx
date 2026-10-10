import Link from "next/link";
import type { ReactNode } from "react";

// Original implementation of Skiper UI's free CssLink hover patterns.
// https://skiper-ui.com/v1/skiper40 — attribution in the footer and guide.
export function RollingLink({ href, children, className = "" }: {
  href: string; children: ReactNode; className?: string;
}) {
  return <Link href={href} className={`rolling-link ${className}`}>
    <span className="rolling-link-window"><span>{children}</span><span aria-hidden="true">{children}</span></span>
    <span className="rolling-link-arrow" aria-hidden="true">↗</span>
  </Link>;
}
