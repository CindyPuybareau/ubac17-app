"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Relie une carte cliquable distante (ex : les indicateurs du tableau de
// bord Bureau, voir bureau-dashboard.tsx) à AdminSidebar
// (admin-sidebar.tsx), qui affiche réellement les sections -- ces deux
// composants ne sont pas parent/enfant directs. Même schéma que
// mobile-nav-context.tsx pour le même genre de problème (un déclencheur
// loin du composant qu'il pilote).
//
// Retour de Cindy du 07/09 ("le clic déclenche un vrai rechargement...
// alors qu'un simple changement de vue sans reload serait plus rapide") :
// AdminSidebar ne relit "?section=..." qu'à son tout premier montage (par
// design, pour éviter un flash de la section par défaut au chargement) --
// rien ne le prévenait plus tard qu'une autre section était demandée. Ce
// contexte porte ce signal : `requestSection(key)` le pose, AdminSidebar le
// consomme (bascule sa section active) puis l'efface aussitôt -- pour
// qu'une seconde demande de la MÊME clé plus tard reste bien détectée
// comme un changement.
const SectionNavContext = createContext<{
  requestedSection: string | null;
  requestSection: (key: string) => void;
  clearRequestedSection: () => void;
} | null>(null);

export function SectionNavProvider({ children }: { children: ReactNode }) {
  const [requestedSection, setRequestedSection] = useState<string | null>(null);
  return (
    <SectionNavContext.Provider
      value={{
        requestedSection,
        requestSection: setRequestedSection,
        clearRequestedSection: () => setRequestedSection(null),
      }}
    >
      {children}
    </SectionNavContext.Provider>
  );
}

export function useSectionNav() {
  const ctx = useContext(SectionNavContext);
  // Hors d'un SectionNavProvider (ne devrait pas arriver dans les espaces
  // connectés, tous enveloppés depuis page.tsx) : no-op silencieux plutôt
  // qu'un crash -- la carte se rabat alors sur son <a href> normal, voir
  // section-link-card.tsx.
  return (
    ctx ?? {
      requestedSection: null,
      requestSection: () => {},
      clearRequestedSection: () => {},
    }
  );
}
