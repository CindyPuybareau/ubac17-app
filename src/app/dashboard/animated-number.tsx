"use client";

import { useEffect, useState } from "react";

// Retour de Cindy du 06/09 ("toutes les cartes contenant des chiffres côté
// bureau [...] une sorte de compteur") : les cartes-KPI (tableau de bord +
// onglet Cotisations) affichaient leur chiffre directement, figé. Ce
// composant anime la valeur de 0 jusqu'à sa vraie valeur à l'apparition de
// la carte -- partagé entre bureau-dashboard.tsx et cotisations-manager.tsx
// plutôt que dupliqué, ces deux fichiers ayant chacun leur propre KpiCard
// (mise en page légèrement différente) qui n'ont besoin que de CE calcul en
// commun.
//
// `format` reçoit la valeur intermédiaire (un flottant pendant l'animation)
// et décide elle-même comment l'arrondir/afficher -- un compteur d'entiers
// passe `Math.round`, un montant garde les centimes via formatAmount (déjà
// tolérant à un flottant), un pourcentage arrondit à l'entier le plus
// proche. Ainsi le "€"/"%"/séparateur de milliers affiché reste identique à
// avant, seul le chiffre grimpe.
export default function AnimatedNumber({
  value,
  format,
  durationMs = 900,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
}) {
  const [display, setDisplay] = useState(0);

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
