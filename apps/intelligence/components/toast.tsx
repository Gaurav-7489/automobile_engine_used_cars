"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Icon } from "./icons";

type Toast = { id: number; message: string; tone: "ok" | "error" };
const ToastContext = createContext<{ toast: (message: string, tone?: "ok" | "error") => void }>({ toast: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, message, tone }]);
    // Completed actions use toasts and fade away. Errors stay until dismissed.
    if (tone === "ok") window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone === "error" ? "error" : ""}`}>
            <Icon name={t.tone === "error" ? "alert" : "check"} />
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss message" onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}><Icon name="close" size={16} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext).toast;
