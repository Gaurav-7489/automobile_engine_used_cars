"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "../icons";
import { useScopedHref } from "../workspace";

// The chat is only downloaded the first time someone opens it.
const AssistantChat = dynamic(() => import("./assistant-chat").then((m) => m.AssistantChat), { ssr: false, loading: () => <p className="meta" style={{ padding: 16 }}>Opening…</p> });

/** The assistant on every page: a small Ask button that opens a side panel. Ctrl/⌘ + J toggles it. */
export function AssistantDock() {
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const href = useScopedHref();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); setOpened(true); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {!open ? <button type="button" className="ask-fab" onClick={() => { setOpen(true); setOpened(true); }} aria-haspopup="dialog" aria-keyshortcuts="Control+J"><Icon name="sparkle" size={18} /><span>Ask</span></button> : null}
      {opened ? (
        <aside className={`ask-panel${open ? " open" : ""}`} role="dialog" aria-label="Assistant" aria-hidden={!open}>
          <header className="ask-head">
            <strong><Icon name="sparkle" size={16} /> Assistant</strong>
            <div className="row-flex">
              <Link className="icon-btn" href={href("/app/assistant")} aria-label="Open full page" onClick={() => setOpen(false)}><Icon name="external" size={16} /></Link>
              <button type="button" className="icon-btn" onClick={() => setOpen(false)} aria-label="Close assistant"><Icon name="close" size={16} /></button>
            </div>
          </header>
          <div className="ask-body"><AssistantChat compact /></div>
        </aside>
      ) : null}
    </>
  );
}
