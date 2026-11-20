import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

// Guide du Bureau (retour de Cindy du 20/11 : "intégrer le guide côté
// Bureau, un symbole à côté de l'organigramme") : la même page que le lien
// partagé par email, servie ici telle quelle depuis
// docs/guide-bureau/guide-bureau.html -- une seule source à tenir à jour
// (le fichier est embarqué au déploiement, voir outputFileTracingIncludes
// dans next.config.ts). Réservé au Bureau : un membre non connecté repart
// vers la connexion, un non-membre du Bureau vers son tableau de bord.
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

export async function GET(request: Request) {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!user) return NextResponse.redirect(new URL("/connexion", request.url));

  const { data: admin } = await supabase
    .from("club_administrators")
    .select("club_function")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle();
  if (!admin) return NextResponse.redirect(new URL("/dashboard", request.url));

  // Polices Google remplacées par les mêmes polices que l'appli (Poppins,
  // Inter), hébergées par l'appli elle-même dans public/fonts (retour de
  // Cindy du 20/11) : la politique de sécurité (CSP, next.config.ts)
  // n'autorise que les polices du site.
  const body = (await readFile(path.join(process.cwd(), "docs", "guide-bureau", "guide-bureau.html"), "utf8"))
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, "");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>${LOCAL_FONTS}:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style>${body.replace("</style>", "</style></head><body>")}</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Propre à chaque personne connectée : jamais mis en cache partagé.
      "Cache-Control": "private, no-store",
    },
  });
}
