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
export async function GET(request: Request) {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!user) return NextResponse.redirect(new URL("/connexion", request.url));

  const { data: admin } = await supabase
    .from("club_administrators")
    .select("club_function")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle();
  if (!admin) return NextResponse.redirect(new URL("/dashboard", request.url));

  // Polices Google retirées : la politique de sécurité de l'appli (CSP,
  // next.config.ts) les bloque -- les polices de secours prévues par le
  // guide s'affichent à la place, sans erreur en console.
  const body = (await readFile(path.join(process.cwd(), "docs", "guide-bureau", "guide-bureau.html"), "utf8"))
    .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>\s*/g, "");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}</style>${body.replace("</style>", "</style></head><body>")}</body></html>`;

  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Propre à chaque personne connectée : jamais mis en cache partagé.
      "Cache-Control": "private, no-store",
    },
  });
}
