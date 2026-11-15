"use client";

import { useEffect, useState } from "react";
import { Dialog } from "./overlay";
import { useToast } from "./toast";
import { Button, Notice } from "./ui";

type Link = { email: string; token: string; expiresAt: string; kind?: "invite" | "reset" };

/** Shows one-time links (invitations, password resets) exactly once, and reports changes the server could not save. */
export function LiveEffects() {
  const toast = useToast();
  const [links, setLinks] = useState<Link[]>([]);
  useEffect(() => {
    const onEffects = (event: Event) => {
      const detail = (event as CustomEvent<{ inviteLinks?: Link[] }>).detail;
      if (detail?.inviteLinks?.length) setLinks(detail.inviteLinks);
    };
    const onError = (event: Event) => { const d = (event as CustomEvent<{ message: string; retry?: () => void }>).detail; toast(d.message, "error", d.retry ? { action: { label: "Retry", onClick: d.retry } } : undefined); };
    window.addEventListener("vl:effects", onEffects);
    window.addEventListener("vl:sync-error", onError);
    return () => { window.removeEventListener("vl:effects", onEffects); window.removeEventListener("vl:sync-error", onError); };
  }, [toast]);
  const url = (link: Link) => `${window.location.origin}/join/${link.token}`;
  return (
    <Dialog open={links.length > 0} onClose={() => setLinks([])} title={links[0]?.kind === "reset" ? "Password reset link" : "Invitation saved"} description="Tell the person their access is ready. They sign in with Continue with Google using exactly this email address; the link below is optional." footer={<Button variant="primary" onClick={() => setLinks([])}>Done</Button>}>
      <div className="stack">
        <Notice tone="accent" role="status">{typeof window === "undefined" ? "" : `They open ${window.location.origin}/login and choose Continue with Google with the email below. The invitation works once and expires.`}</Notice>
        {links.map((link) => (
          <div key={link.token} className="stack-sm">
            <strong>{link.email}</strong>
            <code className="secret" aria-label={`One-time link for ${link.email}`}>{typeof window === "undefined" ? "" : url(link)}</code>
            <span className="meta">Expires {new Date(link.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
            <Button onClick={async () => { try { await navigator.clipboard.writeText(url(link)); toast("Link copied."); } catch { toast("Copy failed: select the link and copy it manually.", "error"); } }}>Copy link</Button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
