import Link from "next/link";
import { getDesktopRelease, releaseRepository } from "../../lib/desktop-release";

export const metadata = { title: "Download Automobile Engine", description: "The VandLabs dealer workspace for Windows and macOS. Connect your dealership, sign in securely and run your day." };

export default async function Download() {
  const release = await getDesktopRelease();
  return <main className="shell section">
    <div className="download-head"><p className="eyebrow">Your dealership, on your desktop</p><h1>A workspace<br />that moves with you.</h1><p className="lede">Inventory. Conversations. Follow-ups. Your dealer operations, connected to the same online workspace.</p><span className="download-version">{release ? `Development build · ${release.tag}` : "Installer release pending"}</span></div>
    <div className="download-cards">{(["windows", "mac"] as const).map(platform => {
      const asset = release?.assets[platform];
      return <article className="download-card" key={platform}><p className="eyebrow">{platform === "windows" ? "WINDOWS / X64" : "MACOS / UNIVERSAL"}</p><h2>{platform === "windows" ? "Made for your PC." : "At home on your Mac."}</h2><p>{platform === "windows" ? "Windows installer for the dealer workspace. WebView2 is handled by the installer when required." : "A universal app for Apple silicon and Intel Macs, packaged in a disk image."}</p>
        {asset ? <a className="button primary" href={`/api/downloads/${platform}`}>Download for {platform === "windows" ? "Windows" : "macOS"} <span aria-hidden="true">↓</span></a> : <span className="download-version">Available after the release pipeline passes</span>}
        {asset && <small>{(asset.size / 1024 / 1024).toFixed(1)} MB · {asset.name}</small>}
        {asset?.sha256 && <details><summary>Verify download checksum</summary><p style={{overflowWrap:"anywhere",fontSize:11}}>SHA-256: {asset.sha256}</p></details>}
        <small>Development distribution. Installers are currently unsigned; macOS notarization and installed-device acceptance are pending.</small>
      </article>;
    })}</div>
    <section className="download-steps" aria-label="Get started"><article><span>01 / INSTALL</span><h3>Choose your computer.</h3><p>Download the installer for your operating system and open the app.</p></article><article><span>02 / CONNECT</span><h3>Enter your workspace URL.</h3><p>The app discovers your dealership’s public sign-in settings. Your administrator activates the shared workspace first.</p></article><article><span>03 / SIGN IN</span><h3>Pick up your day.</h3><p>Sign in through your system browser. Your role controls the records and actions you can access.</p></article></section>
    <p className="subtle">The app requires an online connection and an activated dealership backend. <Link href="/contact">Contact your dealership</Link> for access.</p>
    <a className="button compact" href={release?.url ?? `https://github.com/${releaseRepository}/releases`}>Release details ↗</a>
  </main>;
}
