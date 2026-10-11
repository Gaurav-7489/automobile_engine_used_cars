"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShortlist } from "./shortlist";
import { NavigationDisclosure } from "@vandlabs/design-system/navigation";
export function PrimaryNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const { ids } = useShortlist();
  const links = items.map(item => <Link className="nav-link" key={item.href} href={item.href} aria-current={pathname === item.href || (item.href === "/inventory" && pathname.startsWith("/vehicles/")) ? "page" : undefined}>{item.label}{item.href === "/compare" && ids.length > 0 && <span className="nav-count">{ids.length}</span>}</Link>);
  return <div className="primary-navigation"><nav aria-label="Primary">{links}</nav><NavigationDisclosure className="public-menu" title="Menu" label="Website menu"><nav aria-label="Primary mobile">{links}</nav></NavigationDisclosure></div>;
}
