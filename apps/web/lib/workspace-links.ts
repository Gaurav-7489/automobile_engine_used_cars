/** Also works when the showroom is opened directly on its own deployment. */
export function workspaceLink(path: "/login" | "/install" | "/manifest.webmanifest" | "/app-icons/icon-192.png") {
  const origin = process.env.UNIFIED_APP_ORIGIN ?? "https://vandlabs-automobile-intelligence.vercel.app";
  return `${origin}${path}`;
}
