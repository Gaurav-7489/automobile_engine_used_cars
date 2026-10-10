"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShortlist } from "./shortlist";
export function PrimaryNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const { ids } = useShortlist();
  return <nav aria-label="Primary">{items.map(item => <Link className="nav-link" key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined}>{item.label}{item.href === "/compare" && ids.length > 0 && <span className="nav-count">{ids.length}</span>}</Link>)}</nav>;
}
