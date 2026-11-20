import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

// Guides du club (Bureau, Coach -- retours de Cindy du 20/11) : une page
// HTML statique par public, servie telle quelle depuis docs/, avec les
// mêmes polices que l'appli hébergées par l'appli elle-même (public/fonts)
// -- la politique de sécurité (CSP, next.config.ts) n'autorise que les
// polices du site. Chaque fichier est embarqué au déploiement via
// outputFileTracingIncludes (next.config.ts).
const LOCAL_FONTS = [
  ["Inter", "400 700", "inter-latin"],
  ["Poppins", "600", "poppins-600-latin"],
  ["Poppins", "700", "poppins-700-latin"],
  ["Poppins", "800", "poppins-800-latin"],
]
  .map(
    ([family, weight, file]) =>
      `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(/fonts/${file}.woff2) format("woff2");}`
  )
  .join("");

export async function guideResponse(...segments: string[]) {
  const body = (await readFile(path.join(process.cwd(), ...segments), "utf8")).replace(
    /<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g,
    ""
  );
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${LOCAL_FONTS}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style>${body.replace("</style>", "</style></head><body>")}</body></html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Propre à chaque personne connectée : jamais mis en cache partagé.
      "Cache-Control": "private, no-store",
    },
  });
}
