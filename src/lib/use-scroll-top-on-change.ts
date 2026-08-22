"use client";

import { useEffect, type RefObject } from "react";

// Scrolls back to the top whenever `dependency` changes — used where the
// app switches an internal tab/view without a real URL navigation (a
// coach's multi-team switcher, a modal's own tab bar...), so a scroll
// position left over from the previous view never carries into the next
// one. Resets both the page-level scroll (window/document, covering the
// common case where the tab content is just part of the normal page flow)
// and, when the tab's content lives inside its own scrollable panel
// instead (e.g. a modal body with overflow-y-auto), that container too via
// `containerRef`.
//
// `enabled` (retour de Cindy du 2026-08-22, "au clique sur les onglets du
// menu, mon écran remonte, c'est désagréable") : à false quand ce n'est
// plus un vrai bouton interne mais un composant "forcé" sur une valeur
// fixe pour servir de sous-onglet de menu (forcedTab/forcedTeamId...) — le
// montage/démontage à chaque clic de menu déclencherait sinon quand même
// ce même saut de scroll, alors que le menu lui-même ne scrolle plus (voir
// admin-sidebar.tsx).
export function useScrollTopOnChange(
  dependency: unknown,
  containerRef?: RefObject<HTMLElement | null>,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    containerRef?.current?.scrollTo(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependency, enabled]);
}
