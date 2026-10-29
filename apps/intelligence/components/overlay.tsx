"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Common = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** A dirty draft confirms before discarding. */
  dirty?: boolean;
  initialFocus?: string;
};

function useModal(open: boolean, onClose: () => void, dirty: boolean | undefined, panelRef: React.RefObject<HTMLDivElement | null>, initialFocus?: string) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const [confirming, setConfirming] = useState(false);

  const requestClose = useCallback(() => {
    if (dirty) setConfirming(true);
    else onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The panel is portalled and mounts a moment after `open` changes, so focus is placed once it exists (a few frames at most).
    let frames = 0, frame = 0;
    const place = () => {
      const panel = panelRef.current;
      if (!panel) { if (frames++ < 20) frame = window.requestAnimationFrame(place); return; }
      const target = (initialFocus && panel.querySelector<HTMLElement>(initialFocus)) || panel.querySelector<HTMLElement>("[data-autofocus]") || panel.querySelector<HTMLElement>(FOCUSABLE.replace("a[href], ", ""));
      (target ?? panel).focus();
    };
    frame = window.requestAnimationFrame(place);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      const trigger = triggerRef.current;
      if (trigger && document.contains(trigger)) window.setTimeout(() => trigger.focus(), 0);
    };
  }, [open, panelRef, initialFocus]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      if (confirming) setConfirming(false);
      else requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  return { confirming, setConfirming, requestClose, onKeyDown };
}

function DiscardConfirm({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  return (
    <div className="overlay" style={{ position: "absolute", zIndex: 5 }} role="alertdialog" aria-modal="true" aria-labelledby="discard-title">
      <div className="dialog w480">
        <div className="overlay-head"><h2 className="h3" id="discard-title">Discard unsaved changes?</h2></div>
        <div className="overlay-body"><p className="muted">Your draft has changes that are not saved. Discarding removes them.</p></div>
        <div className="overlay-foot">
          <button type="button" className="btn" onClick={onKeep} data-autofocus>Keep editing</button>
          <button type="button" className="btn btn-danger" onClick={onDiscard}>Discard changes</button>
        </div>
      </div>
    </div>
  );
}

function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

export function Dialog({ open, onClose, title, description, children, footer, dirty, size = "w480", initialFocus }: Common & { size?: "w480" | "w640" | "w720" | "w960" }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const { confirming, setConfirming, requestClose, onKeyDown } = useModal(open, onClose, dirty, panelRef, initialFocus);
  if (!open) return null;
  return (
    <Portal>
      <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }} onKeyDown={onKeyDown}>
        <div ref={panelRef} className={`dialog ${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descId : undefined} tabIndex={-1}>
          <div className="overlay-head">
            <div><h2 className="h2" id={titleId}>{title}</h2>{description ? <p className="muted" id={descId} style={{ marginTop: 4 }}>{description}</p> : null}</div>
            <button type="button" className="icon-btn" aria-label="Close dialog" onClick={requestClose}><Icon name="close" /></button>
          </div>
          <div className="overlay-body">{children}</div>
          {footer ? <div className="overlay-foot">{footer}</div> : null}
          {confirming ? <DiscardConfirm onKeep={() => setConfirming(false)} onDiscard={() => { setConfirming(false); onClose(); }} /> : null}
        </div>
      </div>
    </Portal>
  );
}

export function Drawer({ open, onClose, title, description, children, footer, dirty, size = "w480", initialFocus }: Common & { size?: "w440" | "w480" | "w560" }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { confirming, setConfirming, requestClose, onKeyDown } = useModal(open, onClose, dirty, panelRef, initialFocus);
  if (!open) return null;
  return (
    <Portal>
      <div className="overlay drawer-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose(); }} onKeyDown={onKeyDown}>
        <div ref={panelRef} className={`drawer ${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
          <div className="overlay-head">
            <div><h2 className="h2" id={titleId}>{title}</h2>{description ? <p className="muted" style={{ marginTop: 4 }}>{description}</p> : null}</div>
            <button type="button" className="icon-btn" aria-label="Close panel" onClick={requestClose}><Icon name="close" /></button>
          </div>
          <div className="overlay-body">{children}</div>
          {footer ? <div className="overlay-foot">{footer}</div> : null}
          {confirming ? <DiscardConfirm onKeep={() => setConfirming(false)} onDiscard={() => { setConfirming(false); onClose(); }} /> : null}
        </div>
      </div>
    </Portal>
  );
}

/** Dropdown menu with roving focus, Escape to close and focus restore. */
export function Menu({ label, children, align = "right", icon = "more", buttonClass = "icon-btn", text }: { label: string; children: (close: () => void) => ReactNode; align?: "left" | "right"; icon?: string; buttonClass?: string; text?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left?: number; right?: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const items = () => Array.from(popRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menuitemradio"]') ?? []);

  // The list is drawn in a portal with fixed coordinates so scrolling tables and cards can never clip it.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    const flip = below < 280 && rect.top > below;
    setPos({
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      ...(align === "left" ? { left: Math.max(8, Math.min(rect.left, window.innerWidth - 236)) } : { right: Math.max(8, window.innerWidth - rect.right) }),
    });
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!ref.current?.contains(target) && !popRef.current?.contains(target)) setOpen(false);
    };
    const dismiss = () => setOpen(false);
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => { document.removeEventListener("mousedown", away); window.removeEventListener("resize", dismiss); window.removeEventListener("scroll", dismiss, true); };
  }, [open]);
  useEffect(() => { if (open && pos) items()[0]?.focus(); }, [open, pos]);

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { setOpen(false); buttonRef.current?.focus(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const list = items();
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "ArrowDown" ? (index + 1) % list.length : (index - 1 + list.length) % list.length;
      list[next]?.focus();
    }
  };
  return (
    <div className="row-menu" ref={ref} onKeyDown={onKey}>
      <button ref={buttonRef} type="button" className={buttonClass} aria-haspopup="menu" aria-expanded={open} aria-label={label} onClick={() => setOpen((v) => !v)}>
        {text ?? <Icon name={icon} />}
      </button>
      {open && pos ? createPortal(
        <div ref={popRef} className="menu" style={{ position: "fixed", top: "auto", bottom: "auto", left: "auto", right: "auto", maxHeight: "calc(100dvh - 24px)", overflowY: "auto", ...pos }} role="menu" aria-label={label} onKeyDown={onKey}>{children(() => { setOpen(false); buttonRef.current?.focus(); })}</div>,
        document.body,
      ) : null}
    </div>
  );
}
