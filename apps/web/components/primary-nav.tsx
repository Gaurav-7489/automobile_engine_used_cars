"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavigationDisclosure } from "@vandlabs/design-system/navigation";
import { useSaved } from "./saved";

// Inventory and vehicle pages belong to Discover; comparison belongs to Saved Cars.
const sections: Record<string, (path: string) => boolean> = {
  "/": path => path === "/",
  "/discover": path => path === "/discover" || path === "/inventory" || path.startsWith("/vehicles/"),
  "/saved": path => path === "/saved" || path === "/compare",
  "/contact": path => path === "/contact",
};

export function PrimaryNav({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const { ids, ready } = useSaved();
  const links = (list: { href: string; label: string }[]) => list.map(item => <Link className="nav-link" key={item.href} href={item.href} aria-current={(sections[item.href] ?? (path => path === item.href))(pathname) ? "page" : undefined}>
    {item.label}{item.href === "/saved" && ready && ids.length > 0 && <span className="nav-count" aria-label={`${ids.length} saved`}>{ids.length}</span>}
  </Link>);
  return <div className="primary-navigation"><nav aria-label="Primary">{links(items)}</nav><NavigationDisclosure className="public-menu" title="Menu" label="Website menu"><nav aria-label="Primary mobile">{links([...items, { href: "/contact", label: "Contact" }])}</nav></NavigationDisclosure></div>;
}
