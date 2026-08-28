"use client";

import { useEffect, useState } from "react";
import ConfettiBurst from "./confetti-burst";
import { hasCelebratedMatch, markMatchCelebrated } from "@/lib/celebrated-matches";

// Décide si les confettis doivent se déclencher sur cette carte de résultat
// (retour de Cindy du 26/08) — état démarré à `false` des deux côtés
// (serveur ET client) pour ne jamais provoquer de décalage d'hydratation :
// localStorage n'existe pas côté serveur, un état initial qui en dépendrait
// directement afficherait les confettis côté client mais pas côté serveur
// au même rendu. Le vrai calcul n'a donc lieu qu'après montage, dans
// l'effet, comme toute lecture d'un système externe.
export default function MatchResultCelebration({
  // resultKey plutôt qu'un simple eventId (retour d'audit du 28/08) :
  // inclut le score, pas seulement l'identifiant du match — une victoire
  // corrigée en défaite puis re-corrigée en victoire (ou un score
  // domicile/extérieur inversé à la saisie) doit redéclencher l'animation
  // pour le résultat final, pas hériter du verdict d'un ancien score.
  // Construit par l'appelant, voir calendar-view.tsx/child-results-tab.tsx.
  resultKey,
  isWin,
  enabled,
}: {
  resultKey: string;
  isWin: boolean;
  enabled: boolean;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!enabled || !isWin) return;
    if (hasCelebratedMatch(resultKey)) return;
    // requestAnimationFrame plutôt qu'un setState direct dans le corps de
    // l'effet (react-hooks/set-state-in-effect) — même famille que
    // s'abonner à un système externe puis réagir dans son callback,
    // cohérent avec le fait que ConfettiBurst démarre lui aussi via rAF.
    const raf = requestAnimationFrame(() => {
      setShow(true);
      markMatchCelebrated(resultKey);
    });
    return () => cancelAnimationFrame(raf);
  }, [enabled, isWin, resultKey]);

  if (!show) return null;
  return <ConfettiBurst />;
}
