import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UBAC - Union Basket Angoulins Châtelaillon",
    short_name: "UBAC",
    description:
      "Application du club UBAC : membres, calendrier et convocations.",
    start_url: "/",
    display: "standalone",
    background_color: "#1e4fa8",
    theme_color: "#1e4fa8",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
