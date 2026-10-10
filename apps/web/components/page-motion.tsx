"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** One observer per route; content remains readable when motion or JS is unavailable. */
export function PageMotion() {
  const pathname = usePathname();
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduced.matches || !window.IntersectionObserver) return;
    const nodes = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add("is-revealed"); observer.unobserve(entry.target); }
    }), { threshold: .08 });
    nodes.forEach(node => { node.classList.add("reveal-ready"); observer.observe(node); });
    return () => observer.disconnect();
  }, [pathname]);
  return null;
}
