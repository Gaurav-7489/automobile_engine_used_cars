"use client";

import { useEffect, useState } from "react";

type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const ready = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const done = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", ready); window.removeEventListener("appinstalled", done); };
  }, []);
  return <div className="stack">
    {installed ? <p role="status">You’re using the installed app.</p> : prompt ? <button className="btn btn-primary" onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>Install VandLabs Auto</button> : <p className="muted">In Chrome or Edge, open the browser menu and choose “Install app” or “Install this site as an app”. On iPhone or iPad, open Share in Safari, then Add to Home Screen. On Mac, Safari also offers File → Add to Dock.</p>}
    <p className="muted">The installed app uses the same account, permissions and live records. An internet connection is required.</p>
  </div>;
}
