"use client";

import { useEffect, useState } from "react";
import { Icon } from "./icons";

const BASE = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_BASE ?? "https://github.com/Gaurav-7489/automobile_engine_used_cars/releases/download/desktop-latest";

type Os = "windows" | "macos" | "linux";
const PACKAGES: { os: Os; name: string; blurb: string; files: { label: string; file: string; note: string }[]; steps: string[] }[] = [
  { os: "windows", name: "Windows", blurb: "Windows 10 or 11, 64-bit", files: [{ label: "Installer (.exe)", file: "Automobile-Engine-Windows-x64.exe", note: "Recommended" }, { label: "MSI package (.msi)", file: "Automobile-Engine-Windows-x64.msi", note: "For managed IT deployment" }],
    steps: ["Download the .exe and run it.", "If Windows SmartScreen says the app is unrecognised, choose More info, then Run anyway. The builds are not yet code-signed.", "Open Automobile Engine from the Start menu."] },
  { os: "macos", name: "macOS", blurb: "Apple silicon and Intel (universal)", files: [{ label: "Disk image (.dmg)", file: "Automobile-Engine-macOS-universal.dmg", note: "Recommended" }],
    steps: ["Open the .dmg and drag Automobile Engine into Applications.", "The first time, Control-click the app and choose Open (the builds are not yet notarized by Apple).", "Sign in through your browser when asked."] },
  { os: "linux", name: "Linux", blurb: "64-bit, most distributions", files: [{ label: "AppImage (.AppImage)", file: "Automobile-Engine-Linux-x64.AppImage", note: "Runs anywhere, no install" }, { label: "Debian / Ubuntu (.deb)", file: "Automobile-Engine-Linux-x64.deb", note: "" }, { label: "Fedora / RHEL (.rpm)", file: "Automobile-Engine-Linux-x64.rpm", note: "" }],
    steps: ["AppImage: make it executable (chmod +x Automobile-Engine-Linux-x64.AppImage) and run it.", ".deb: sudo apt install ./Automobile-Engine-Linux-x64.deb", ".rpm: sudo dnf install ./Automobile-Engine-Linux-x64.rpm"] },
];

function detect(): Os {
  const ua = `${navigator.userAgent} ${(navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? ""}`.toLowerCase();
  if (/win/.test(ua)) return "windows";
  if (/mac|iphone|ipad/.test(ua)) return "macos";
  return "linux";
}

/** Desktop installers for each system, with the one for this computer first. Files are published by the "Publish desktop development release" workflow. */
export function DesktopDownloads() {
  const [mine, setMine] = useState<Os | null>(null);
  useEffect(() => setMine(detect()), []);
  const ordered = [...PACKAGES].sort((a, b) => (a.os === mine ? -1 : b.os === mine ? 1 : 0));
  return (
    <section className="stack" aria-labelledby="dl-h">
      <h2 className="h2" id="dl-h">Desktop app</h2>
      <p className="muted">The same account, roles and records as the web app, in its own window. Sign-in opens your browser. Windows, macOS and Linux.</p>
      <div className="stack">
        {ordered.map((p) => (
          <article key={p.os} className="card stack-sm" aria-label={p.name}>
            <div className="spread"><h3 className="h3">{p.name}{p.os === mine ? <span className="badge accent" style={{ marginLeft: 8 }}>Your computer</span> : null}</h3><span className="meta">{p.blurb}</span></div>
            <div className="row-flex" style={{ flexWrap: "wrap" }}>
              {p.files.map((f, i) => (
                <a key={f.file} className={`btn ${i === 0 && p.os === mine ? "btn-primary" : ""}`} href={`${BASE}/${f.file}`} download style={{ whiteSpace: "normal", height: "auto", paddingBlock: 10, textAlign: "left", maxWidth: "100%" }}><Icon name="download" size={18} /><span className="dl-text"><span>{f.label}</span>{f.note ? <span className="meta">{f.note}</span> : null}</span></a>
              ))}
            </div>
            <ol className="meta" style={{ margin: 0, paddingLeft: 18 }}>{p.steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </article>
        ))}
      </div>
      <p className="meta">Check a download against <a href={`${BASE}/SHA256SUMS.txt`}>SHA256SUMS.txt</a>. These are development builds and are not yet code-signed, which is why Windows and macOS ask you to confirm the first launch. Your dealership must have the desktop feature switched on.</p>
    </section>
  );
}
