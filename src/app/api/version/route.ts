import { NextResponse } from "next/server";

// Identifiant du déploiement en ligne, lu par version-watcher.tsx (bandeau
// "Une nouvelle version de l'appli est disponible"). Remplace le
// re-téléchargement complet de la page affichée (audit du 12/11) : sur le
// tableau de bord, chaque vérification relançait tout le calcul serveur
// et des dizaines de lectures en base -- à chaque retour sur l'appli
// (visibilitychange, très fréquent sur mobile). Ici : une constante, zéro
// base de données, exclue du proxy d'authentification (src/proxy.ts).
//
// APP_BUILD_ID est figé au moment du build (next.config.ts, `env`) : le
// client en ligne connaît le sien, cette route renvoie celui du
// déploiement actuellement servi -- différents = nouvelle version.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { id: process.env.APP_BUILD_ID ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
