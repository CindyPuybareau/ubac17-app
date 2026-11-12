"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

// Retour de Cindy du 14/09 ("les enfants n'ont pas à supprimer leur appli
// sur mobile pour la réinstaller, c'est chiant") : une PWA "ajoutée à
// l'écran d'accueil" garde très souvent la même page JS en mémoire d'un
// lancement à l'autre (surtout iOS Safari) -- un nouveau déploiement ne se
// voit alors JAMAIS tant que l'utilisateur ne force pas lui-même un vrai
// rechargement. sw.js ne met rien en cache (voir son propre commentaire en
// tête de fichier) : ce n'est donc pas lui le coupable, c'est simplement
// l'instance JS déjà chargée qui ne sait pas qu'une version plus récente
// existe.
//
// Détection (audit du 12/11) : l'identifiant du build figé dans CE code
// (APP_BUILD_ID, next.config.ts) comparé à celui que renvoie
// /api/version, servi par le déploiement actuellement en ligne.
// Remplace l'ancienne méthode, qui re-téléchargeait la page affichée en
// entier pour comparer ses <script> : sur le tableau de bord, chaque
// vérification relançait tout le calcul serveur (des dizaines de lectures
// en base, ~5 s) -- et ce à chaque retour sur l'appli, un geste très
// fréquent sur mobile (changer d'appli, verrouiller l'écran). Constaté le
// 12/11 : un onglet basculant souvent de visibilité rechargeait ainsi le
// tableau de bord toutes les 6 secondes.
//
// Vérifié à la reprise (visibilitychange) et, en repli, toutes les 15
// minutes tant que l'onglet reste au premier plan (sessions longues, ex.
// suivi d'un match) -- jamais plus d'une fois toutes les 5 minutes.
//
// Bannière plutôt que rechargement automatique : arracher la page sous les
// pieds de quelqu'un qui répond présent/absent ou remplit un formulaire
// serait pire que la version périmée elle-même -- toujours un geste
// volontaire (bouton "Recharger"). Retour de Cindy du 16/09 : une version
// avec rechargement automatique une fois l'onglet inactif a été tentée
// puis retirée le même jour (suspectée de bloquer la connexion sur
// mobile, où changer d'appli/verrouiller l'écran déclenche
// `visibilitychange` très souvent) -- retour à cette version simple,
// jamais reprise depuis.
const MY_BUILD_ID = process.env.APP_BUILD_ID;
const MIN_CHECK_INTERVAL_MS = 5 * 60 * 1000;

export default function VersionWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    // En local ("local") ou sans identifiant : rien à comparer.
    if (!MY_BUILD_ID || MY_BUILD_ID === "local") return;

    let cancelled = false;
    let lastCheckAt = Date.now();

    async function checkForUpdate() {
      if (Date.now() - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
      lastCheckAt = Date.now();
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const { id } = (await res.json()) as { id?: string | null };
        if (!cancelled && id && id !== MY_BUILD_ID) {
          setUpdateAvailable(true);
        }
      } catch {
        // Pas de réseau, ou requête bloquée (mode hors-ligne) : on
        // retentera à la prochaine occasion, jamais bloquant pour l'usage
        // normal de l'appli.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") checkForUpdate();
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    const interval = setInterval(checkForUpdate, 15 * 60 * 1000);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  if (!updateAvailable) return null;

  return (
    // Retour de Cindy du 15/09 ("on ne le voit pas, c'est caché") :
    // z-[200] (au-dessus de tout le reste de l'appli, y compris les
    // superpositions plein écran à z-50) + ombre plus marquée pour se
    // détacher franchement du contenu ; pb-[env(safe-area-inset-bottom)]
    // laisse la place à la barre de geste des iPhone récents en PWA
    // "ajoutée à l'écran d'accueil" -- sinon le bouton Recharger se
    // retrouvait collé sous cette barre, difficile à taper précisément.
    <div
      className="animate-version-banner-in fixed inset-x-0 bottom-0 z-[200] flex flex-wrap items-center justify-center gap-2.5 border-t border-white/10 bg-navy px-4 pb-[calc(env(safe-area-inset-bottom)+0.625rem)] pt-2.5 text-center text-sm text-white shadow-[0_-4px_16px_rgba(0,0,0,0.25)] sm:gap-3"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-ubac-yellow" />
      <span>Une nouvelle version de l&apos;appli est disponible.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="rounded-full bg-ubac-yellow px-3 py-1 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
      >
        Recharger
      </button>
    </div>
  );
}
