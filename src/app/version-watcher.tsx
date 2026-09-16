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
// Détection sans aucune infrastructure dédiée : chaque script <script
// src="/_next/static/chunks/...xxxx.js"> porte un nom haché sur son
// contenu -- tenté d'abord avec le buildId Next.js classique
// (__NEXT_DATA__.buildId), qui n'existe tout simplement pas avec l'App
// Router + Turbopack (vérifié : absent du HTML servi). L'empreinte
// retenue est donc la liste triée des chemins <script src> réellement
// présents sur la page -- n'importe quel changement de code fait changer
// au moins un de ces chemins, un vrai déploiement les change presque
// tous. Comparée à celle d'une page fraîchement récupérée (jamais depuis
// le cache du navigateur, cache: "no-store", même route que celle
// affichée pour rester une comparaison juste).
//
// Vérifié à la reprise (visibilitychange, le moment le plus courant où une
// PWA "rouvre" sans jamais vraiment recharger) et, en repli, toutes les 15
// minutes tant que l'onglet reste au premier plan (sessions longues, ex.
// suivi d'un match).
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
function scriptPathsFromHtml(html: string): string[] {
  const paths: string[] = [];
  const re = /<script[^>]+src="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    paths.push(match[1]);
  }
  return paths;
}

function currentScriptPaths(): string[] {
  return Array.from(document.scripts)
    .map((s) => {
      if (!s.src) return null;
      try {
        // .src est une URL absolue (propriété DOM), le HTML brut donne des
        // chemins relatifs -- il faut la même forme des deux côtés, sinon
        // chaque comparaison "diffère" à tort dès la première vérification.
        return new URL(s.src, window.location.origin).pathname;
      } catch {
        return null;
      }
    })
    .filter((p): p is string => Boolean(p));
}

function fingerprint(paths: string[]): string {
  return [...paths].sort().join("|");
}

export default function VersionWatcher() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const myFingerprint = fingerprint(currentScriptPaths());
    // Rien à comparer si la page elle-même n'a chargé aucun script décelé
    // (cas dégénéré, jamais rencontré en pratique) -- pas de fausse alerte
    // à partir de rien.
    if (!myFingerprint) return;

    let cancelled = false;
    async function checkForUpdate() {
      try {
        const res = await fetch(window.location.pathname + window.location.search, {
          cache: "no-store",
        });
        const html = await res.text();
        const latestFingerprint = fingerprint(scriptPathsFromHtml(html));
        if (!cancelled && latestFingerprint && latestFingerprint !== myFingerprint) {
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
