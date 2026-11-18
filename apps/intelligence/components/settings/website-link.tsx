"use client";

import { useEffect, useState } from "react";
import { formatShortDateTime } from "@/lib/format";
import { call, ConfirmIdentity, useReauth } from "../admin/shared";
import { useToast } from "../toast";
import { Badge, Button, EmptyState, FormSummary, Notice, TextField } from "../ui";
import { ListSkeleton } from "./settings-skeleton";

type OwnWebsite = { id: string; site: string; prefix: string; createdAt: string; expiresAt: string | null; lastUsedAt: string | null };

/**
 * Links the owner's own website to this workspace. The website then reads published stock and records enquiries here. The key is shown
 * once; the website keeps it as VANDLABS_API_KEY. Linking and disconnecting each need their own fresh Google confirmation.
 */
export function WebsiteLink() {
  const toast = useToast();
  const auth = useReauth();
  const [sites, setSites] = useState<OwnWebsite[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ site: string; key: string } | null>(null);

  const load = async () => {
    const r = await call<{ websites: OwnWebsite[] }>("/api/workspace/websites");
    if (r.ok) { setSites(r.data.websites ?? []); setLoadError(""); } else setLoadError(r.data.error?.message ?? "Websites could not be loaded.");
  };
  useEffect(() => { void load(); }, []);

  const link = async () => {
    setBusy(true); setErrors({}); setIssued(null);
    const failed = await auth.confirm(password, { action: "workspace.websites" });
    if (failed) { setBusy(false); setErrors({ form: failed }); return; }
    const r = await call<{ key: string; site: string }>("/api/workspace/websites", { method: "POST", body: JSON.stringify({ siteUrl }) });
    setBusy(false);
    if (r.data.error?.code === "reauth_required") auth.expired();
    if (!r.ok) { setErrors({ ...(r.data.error?.fields ?? {}), form: r.data.error?.message ?? "The website was not linked. Nothing was changed." }); return; }
    setIssued({ site: r.data.site, key: r.data.key });
    setSiteUrl(""); setPassword("");
    toast(`${r.data.site} is linked.`);
    void load();
  };

  const disconnect = async (site: OwnWebsite) => {
    setBusy(true); setErrors({});
    const failed = await auth.confirm(password, { action: "workspace.websites" });
    if (failed) { setBusy(false); setErrors({ form: failed }); return; }
    const r = await call<object>("/api/workspace/websites", { method: "DELETE", body: JSON.stringify({ keyId: site.id }) });
    setBusy(false);
    if (r.data.error?.code === "reauth_required") auth.expired();
    if (!r.ok) { setErrors({ form: r.data.error?.message ?? "The website was not disconnected. Nothing was changed." }); return; }
    setPassword("");
    toast(`${site.site} is disconnected. It no longer reads stock from this workspace.`);
    void load();
  };

  return (
    <section className="card stack" aria-labelledby="website-h">
      <h2 className="h2" id="website-h">Dealership website</h2>
      <p className="muted">Link your website so it reads published stock and sends enquiries to this workspace. Nothing else is read. The key is shown once.</p>
      <FormSummary errors={errors.form ? { form: errors.form } : {}} />
      {issued ? (
        <Notice tone="accent" role="status">
          <span>Copy this key now. It is shown once. Set it on {issued.site} as <code>VANDLABS_API_KEY</code>.</span>
          <p><code style={{ wordBreak: "break-all" }}>{issued.key}</code></p>
        </Notice>
      ) : null}
      <div className="stack">
        <TextField label="Website address" value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="https://www.yourdealership.example" error={errors.siteUrl} help="The full address your customers visit." autoComplete="url" />
        <ConfirmIdentity needsPassword={auth.needsPassword} password={password} onPassword={setPassword} />
        <div><Button variant="primary" loading={busy} loadingLabel="Linking" disabled={!siteUrl.trim()} onClick={link}>Link website</Button></div>
      </div>
      {sites === null && !loadError ? <ListSkeleton rows={1} title="Loading websites" /> : null}
      {loadError ? <Notice tone="warn" role="alert">{loadError}</Notice> : null}
      {sites && !sites.length ? <EmptyState title="No website linked yet">Link your website above to show its stock here.</EmptyState> : null}
      {sites?.length ? (
        <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {sites.map((site) => (
            <li key={site.id} className="spread" style={{ flexWrap: "wrap", gap: 8 }}>
              <span className="row-flex"><Badge tone="accent">Website</Badge>{site.site}</span>
              <span className="muted">Key <code>{site.prefix}…</code>, expires {site.expiresAt ? formatShortDateTime(site.expiresAt) : "never"}, last used {site.lastUsedAt ? formatShortDateTime(site.lastUsedAt) : "never"}</span>
              <Button variant="danger" disabled={busy} onClick={() => void disconnect(site)}>Disconnect</Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
