import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "The Fragrance Shop Platform",
    short_name: "TFS Platform",
    description: "Internal operations platform for The Fragrance Shop.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait",
    background_color: "#f7f4fb",
    theme_color: "#232154",
    prefer_related_applications: false,
    icons: [
      {
        src: "/tfs-pwa-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/tfs-pwa-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      },
    ],
  } as MetadataRoute.Manifest
}
