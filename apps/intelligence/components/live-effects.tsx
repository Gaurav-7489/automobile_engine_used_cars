"use client";

import { useEffect, useState } from "react";
import { withBase } from "@/lib/base-path";
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
    const onError = (event: Event) => toast((event as CustomEvent<{ message: string }>).detail.message, "error");
    window.addEventListener("vl:effects", onEffects);
    window.addEventListener("vl:sync-error", onError);
    return () => { window.removeEventListener("vl:effects", onEffects); window.removeEventListener("vl:sync-error", onError); };
  }, [toast]);
  const url = (link: Link) => `${window.location.origin}${withBase(`/join/${link.token}`)}`;
  return (
    <Dialog open={links.length > 0} onClose={() => setLinks([])} title={links[0]?.kind === "reset" ? "Password reset link" : "Invitation link"} description="Shown once. Share it only with the person named. It works one time and expires." footer={<Button variant="primary" onClick={() => setLinks([])}>I have shared it</Button>}>
      <div className="stack">
        <Notice tone="warn" role="status">No email is sent from this release. Copy the link and send it yourself.</Notice>
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
