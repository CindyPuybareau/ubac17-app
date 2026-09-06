"use client";

import { useEffect, useState } from "react";
import { formatAmount } from "./cotisation-shared";

// Retour de Cindy du 06/09 ("toutes les cartes contenant des chiffres côté
// bureau [...] une sorte de compteur") : les cartes-KPI (tableau de bord +
// onglet Cotisations) affichaient leur chiffre directement, figé. Ce
// composant anime la valeur de 0 jusqu'à sa vraie valeur à l'apparition de
// la carte -- partagé entre bureau-dashboard.tsx et cotisations-manager.tsx
// plutôt que dupliqué, ces deux fichiers ayant chacun leur propre KpiCard
// (mise en page légèrement différente) qui n'ont besoin que de CE calcul en
// commun.
//
// `kind` (une simple chaîne, pas une fonction) décide comment la valeur
// intermédiaire (un flottant pendant l'animation) est mise en forme --
// PANNE EN PRODUCTION du 06/09 : la toute première version prenait une
// fonction `format` en prop. bureau-dashboard.tsx est un composant SERVEUR
// (page.tsx, jamais "use client") : une fonction créée côté serveur ne
// peut pas traverser la frontière serveur/client vers ce composant-ci
// ("use client") -- React casse au rendu avec "Functions cannot be passed
// directly to Client Components". cotisations-manager.tsx (déjà "use
// client" en entier) ne montrait jamais le bug, d'où le crash uniquement
// sur le tableau de bord. Une chaîne comme "integer"/"amount"/"percent"
// traverse cette frontière sans problème -- la mise en forme elle-même vit
// ici, câblée en dur, plutôt que reçue de l'appelant.
type NumberKind = "integer" | "amount" | "percent";

const FORMATTERS: Record<NumberKind, (n: number) => string> = {
  integer: (n) => String(Math.round(n)),
  amount: formatAmount,
  percent: (n) => `${Math.round(n)} %`,
};

export default function AnimatedNumber({
  value,
  kind,
  durationMs = 900,
}: {
  value: number;
  kind: NumberKind;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(0);
  const format = FORMATTERS[kind];

  useEffect(() => {
    let frameId: number;

    // Respecte "réduire les animations" (réglage d'accessibilité du
    // système) : la valeur s'affiche directement, sans grimper -- rien à
    // gagner à animer pour qui a explicitement demandé le contraire. Le
    // setState passe par un requestAnimationFrame même ici (jamais appelé
    // de façon synchrone dans le corps de l'effet) : un frame de délai est
    // imperceptible, et ça évite les rendus en cascade que déclenche un
    // setState synchrone dans un effet.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      frameId = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frameId);
    }

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // Décélération (ease-out cubique) : démarre vite, ralentit en
      // approchant la valeur finale -- plus agréable qu'une vitesse
      // constante pour un compteur.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        // Dernière valeur exacte plutôt que value * 1 (évite tout écart
        // d'arrondi issu de l'interpolation flottante).
        setDisplay(value);
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [value, durationMs]);

  return <>{format(display)}</>;
}
