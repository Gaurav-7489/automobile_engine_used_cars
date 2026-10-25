/**
 * One product, one address: the slim bar every staff surface shows on top, so Automobile Intelligence, Command
 * Center and Platform read as sections of one VandLabs product. Plain links on the same origin (each section is
 * its own app behind the gateway), so navigation works before hydration and needs no client code.
 * Styles are inline so the bar looks identical inside every app's own stylesheet.
 */
export type ProductSection = "intelligence" | "command" | "platform" | "website";

const SECTIONS: readonly { id: ProductSection; label: string; href: string }[] = [
  { id: "intelligence", label: "Intelligence", href: "/intelligence/app/overview" },
  { id: "command", label: "Command Center", href: "/command" },
  { id: "platform", label: "Platform", href: "/platform" },
  { id: "website", label: "Website", href: "/" },
];

export function productSections(current: ProductSection, options: { platform?: boolean } = {}) {
  return SECTIONS.filter((s) => s.id !== "platform" || options.platform || current === "platform").map((s) => ({ ...s, active: s.id === current }));
}

export function ProductBar({ current, platform = false }: { current: ProductSection; platform?: boolean }) {
  return (
    <nav aria-label="VandLabs product" data-product-bar="" style={{ display: "flex", alignItems: "center", gap: 4, minHeight: 40, padding: "0 16px", background: "#0f1115", color: "#e8eaed", font: "500 13px/1 system-ui, -apple-system, 'Segoe UI', sans-serif", overflowX: "auto", position: "relative", zIndex: 50 }}>
      <strong style={{ letterSpacing: "0.08em", marginRight: 12, whiteSpace: "nowrap" }}>VANDLABS</strong>
      {productSections(current, { platform }).map((s) => (
        <a key={s.id} href={s.href} aria-current={s.active ? "page" : undefined}
          style={{ color: s.active ? "#ffffff" : "#aab0b8", textDecoration: "none", padding: "8px 10px", borderRadius: 6, background: s.active ? "rgba(255,255,255,0.12)" : "transparent", whiteSpace: "nowrap" }}>
          {s.label}
        </a>
      ))}
    </nav>
  );
}
