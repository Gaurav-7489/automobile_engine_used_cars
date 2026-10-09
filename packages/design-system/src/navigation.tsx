"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const paths: Record<string, string> = {
  Overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  Inventory: "m3 16 2-8h14l2 8 M5 16v4 M19 16v4 M3 16h18 M7 12h.01 M17 12h.01",
  Leads: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8 M20 8v6 M17 11h6",
  Pipeline: "M4 4v16 M12 4v16 M20 4v16 M2 7h4 M10 12h4 M18 17h4",
  Tasks: "M9 5h11 M9 12h11 M9 19h11 M3 5l1 1 2-3 M3 12l1 1 2-3 M3 19l1 1 2-3",
  Appointments: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2",
  Analytics: "M4 20V10 M10 20V4 M16 20v-9 M22 20H2",
  Intelligence: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z",
  Capital: "M3 7h18v14H3z M3 7l14-4v4 M15 12h6v5h-6z",
  Settings: "M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M5.6 18.4l2.1-2.1 M16.3 7.7l2.1-2.1 M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
};

export function NavIcon({ label }: { label: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[label] ?? "M4 4h16v16H4z M8 9h8 M8 15h8"} /></svg>;
}

export function WorkspaceNav({ items, basePath = "", className, label }: {
  items: readonly (readonly [string, string])[]; basePath?: string; className?: string; label: string;
}) {
  const pathname = usePathname();
  const local = pathname.startsWith(basePath + "/") ? pathname.slice(basePath.length) : pathname === basePath ? "/" : pathname;
  return <nav className={className} aria-label={label}>{items.map(([name, href]) => {
    const active = href === "/" ? local === "/" : local === href || local.startsWith(href + "/");
    return <Link key={href} href={href} className={active ? "is-active" : undefined} aria-current={active ? "page" : undefined}><NavIcon label={name} /><span>{name}</span></Link>;
  })}</nav>;
}
