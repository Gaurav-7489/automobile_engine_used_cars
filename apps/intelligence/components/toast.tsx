"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Icon } from "./icons";

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; tone: "ok" | "error"; action?: ToastAction };
type ToastFn = (message: string, tone?: "ok" | "error", options?: { action?: ToastAction }) => void;
const ToastContext = createContext<{ toast: ToastFn }>({ toast: () => undefined });
const MAX_VISIBLE = 4;

/**
 * Completed actions are announced politely and fade away. Failures are announced assertively, stay until dismissed and can carry a
 * Retry. Two live regions exist from the start so the first message is announced reliably.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback<ToastFn>((message, tone = "ok", options) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.filter((t) => !(t.message === message && t.tone === tone)), { id, message, tone, action: options?.action }].slice(-MAX_VISIBLE));
    if (tone === "ok") window.setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);
  const value = useMemo(() => ({ toast }), [toast]);
  const render = (t: Toast) => (
    <div key={t.id} className={`toast ${t.tone === "error" ? "error" : ""}`}>
      <Icon name={t.tone === "error" ? "alert" : "check"} />
      <span>{t.message}</span>
      {t.action ? <button type="button" className="toast-action" onClick={() => { dismiss(t.id); t.action!.onClick(); }}>{t.action.label}</button> : null}
      <button type="button" aria-label="Dismiss message" onClick={() => dismiss(t.id)}><Icon name="close" size={16} /></button>
    </div>
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts">
        <div role="status" aria-live="polite" aria-atomic="false" className="toast-region">{toasts.filter((t) => t.tone === "ok").map(render)}</div>
        <div role="alert" aria-live="assertive" aria-atomic="false" className="toast-region">{toasts.filter((t) => t.tone === "error").map(render)}</div>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext).toast;
