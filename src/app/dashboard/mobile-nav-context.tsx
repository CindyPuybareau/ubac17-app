"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Relie le bouton "hamburger" de la bande bleue (rendu dans l'en-tête,
// page.tsx / child-dashboard.tsx) au panneau de navigation qu'affiche
// AdminSidebar — deux composants qui ne sont pas directement imbriqués
// l'un dans l'autre (le bouton vit dans l'en-tête, AdminSidebar est monté
// plus bas, à l'intérieur de chaque espace). Un contexte évite d'avoir à
// faire descendre l'état "menu ouvert" à travers admin-view/coach-view/
// family-view/child-dashboard, qui n'en ont eux-mêmes aucun usage.
//
// Retour de Cindy du 2026-08-22 : la barre du bas (mobile) demandait de
// scroller horizontalement dès qu'il y avait beaucoup d'onglets — remplacée
// par ce bouton + panneau sur mobile ET tablette (le PC garde la barre
// latérale classique, inchangée).
const MobileNavContext = createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
} | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <MobileNavContext.Provider value={{ open, setOpen }}>{children}</MobileNavContext.Provider>
  );
}

export function useMobileNav() {
  const ctx = useContext(MobileNavContext);
  // Hors d'un MobileNavProvider (ne devrait pas arriver dans les espaces
  // connectés, tous enveloppés) : un no-op silencieux plutôt qu'un crash,
  // le bouton se contente alors de ne rien faire.
  return ctx ?? { open: false, setOpen: () => {} };
}
