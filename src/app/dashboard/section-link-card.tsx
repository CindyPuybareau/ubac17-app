"use client";

import type { MouseEvent, ReactNode } from "react";
import { useSectionNav } from "./section-nav-context";

// Enveloppe cliquable minimale (retour de Cindy du 07/09, "un simple
// changement de vue sans reload serait plus rapide"). bureau-dashboard.tsx
// reste un composant SERVEUR (voir son commentaire sur AnimatedNumber --
// PANNE EN PRODUCTION du 06/09 à ce sujet) : seul ce petit composant a
// besoin d'être "use client" pour utiliser le contexte SectionNav.
// `children` (le contenu de la carte, déjà construit côté serveur dans
// bureau-dashboard.tsx) traverse la frontière sans problème : ce sont des
// éléments React déjà rendus, pas des fonctions.
export default function SectionLinkCard({
  sectionKey,
  href,
  className,
  children,
}: {
  // Clé de la section AdminSidebar visée (ex: "cotisations-licences") --
  // voir admin-sidebar.tsx / admin-view.tsx pour la liste des clés.
  sectionKey: string;
  // Toujours fourni en vrai <a href> : garde le clic milieu / Ctrl+clic /
  // Cmd+clic ("ouvrir dans un nouvel onglet") natifs et fonctionnels, et
  // sert de secours si jamais ce composant se retrouvait rendu hors d'un
  // SectionNavProvider (ne devrait pas arriver, toute la page en est
  // enveloppée depuis page.tsx).
  href: string;
  className: string;
  children: ReactNode;
}) {
  const { requestSection } = useSectionNav();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    // Clic milieu, Ctrl/Cmd/Maj-clic : laisser le navigateur ouvrir un
    // nouvel onglet comme n'importe quel lien normal, ne jamais
    // intercepter ces cas (même logique que next/link en interne).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    requestSection(sectionKey);
  }

  return (
    <a href={href} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
