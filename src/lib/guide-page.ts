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

// Bouton "Retour à l'appli" (retour de Cindy du 21/11) : toujours visible en
// bas à gauche (le bouton "Sommaire" est en bas à droite). Revient à la page
// précédente de l'appli si on vient d'elle, sinon au tableau de bord.
const BACK_BUTTON = `<style>.back-to-app{position:fixed;left:max(16px,env(safe-area-inset-left,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:7;display:flex;align-items:center;gap:6px;padding:10px 14px;border-radius:999px;background:#f4c430;color:#162365;font:700 13px Inter,system-ui,sans-serif;text-decoration:none;box-shadow:0 6px 18px rgba(20,26,51,.25)}.back-to-app:focus-visible{outline:3px solid #203090;outline-offset:2px}@media print{.back-to-app{display:none}}</style><a class="back-to-app" href="/dashboard" onclick="if(document.referrer&&new URL(document.referrer).origin===location.origin&&history.length>1){history.back();return false;}"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Retour à l'appli</a>`;

export async function guideResponse(...segments: string[]) {
  const body = (await readFile(path.join(process.cwd(), ...segments), "utf8")).replace(
    /<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g,
    ""
  );
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${LOCAL_FONTS}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style>${body.replace("</style>", "</style></head><body>")}${BACK_BUTTON}</body></html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Propre à chaque personne connectée : jamais mis en cache partagé.
      "Cache-Control": "private, no-store",
    },
  });
}
