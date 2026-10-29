import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "VandLabs Automobile",
    short_name: "VandLabs Auto",
    description: "Private dealership workspace and VandLabs administration in one application.",
    start_url: "/login?source=installed",
    scope: "/",
    display: "standalone",
    background_color: "#0a0d14",
    theme_color: "#0a0d14",
    icons: [192, 512].map(size => ({ src: `/app-icons/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })),
    shortcuts: [
      { name: "My workspace", url: "/app/overview" },
    ],
  };
}
