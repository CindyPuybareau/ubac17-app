import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UBAC - Union Basket Angoulins Châtelaillon",
    short_name: "UBAC",
    description:
      "Application du club UBAC : membres, calendrier et convocations.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#203090",
    orientation: "portrait",
    icons: [
      {
        src: "/icon-192.png?v=2",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512-maskable.png?v=2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
