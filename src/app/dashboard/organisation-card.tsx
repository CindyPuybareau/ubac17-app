"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

// Retour de Cindy du 17/09 ("faire le distingo... un autre onglet peut
// être ?") : "Organisation match officiel" (MatchOfficialsPanel) vivait
// jusqu'ici DANS cette même carte, juste séparé par un libellé -- pas assez
// visible. Deux cartes empilées plutôt qu'un onglet à cliquer (les deux
// restent visibles d'un coup d'œil, jamais besoin de choisir laquelle
// regarder). "yellow" (défaut) couvre tous les appelants existants sans
// rien changer pour eux ; "terracotta" est réservé à la nouvelle carte.
const VARIANTS = {
  yellow: {
    icon: ClipboardList,
    title: "Organisation",
    header: "bg-ubac-yellow/15 hover:bg-ubac-yellow/25",
    iconBadge: "bg-ubac-yellow text-navy",
  },
  terracotta: {
    icon: ShieldCheck,
    title: "Organisation match officiel",
    header: "bg-terracotta/15 hover:bg-terracotta/25",
    iconBadge: "bg-terracotta text-white",
  },
} as const;

// Boîte partagée "Organisation" (Maillots/Table de marque + Besoins
// d'organisation) — jusqu'ici un simple <div> répété à l'identique dans
// calendar-view.tsx, coach-next-match-card.tsx et next-convocation-card.tsx.
// Rétractable (retour de Cindy du 2026-08-21) : la carte peut vite
// s'allonger (plusieurs rôles + plusieurs besoins), la plupart du temps on
// n'a pas besoin de la garder ouverte en permanence. Repliée par défaut
// (retour de Cindy du 2026-08-23, "fermé en automatique sur tous les
// espaces"). Même habillage que "Tarifs par catégorie"
// (category-tariffs-editor.tsx) — retour de Cindy du 2026-08-23, "même
// couleur... pour être bien visible sur tous les espaces" : bandeau or,
// badge icône carré, titre en gras — un seul fichier partagé sur les 4
// espaces au lieu de deux styles différents pour la même idée
// "encart rétractable".
export default function OrganisationCard({
  children,
  // Retour de Cindy du 12/09 ("ouvrir les besoins d'organisation en
  // automatique dès le prochain événement") : exception ciblée à la règle
  // du 2026-08-23 ci-dessus -- reste `false` partout ailleurs (calendrier,
  // bandeau "Cette semaine", Espace Enfant), n'est passé à `true` que par
  // l'appelant pour LA carte du tout prochain événement à venir
  // (calendar-view.tsx) et par coach-next-match-card.tsx, qui n'affiche de
  // toute façon jamais que celui-là.
  defaultOpen = false,
  variant = "yellow",
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  variant?: keyof typeof VARIANTS;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const v = VARIANTS[variant];
  const Icon = v.icon;

  return (
    // Retour de Cindy du 13/09 ("l'onglet déroulant des commissions n'est
    // pas visible en entier") : cette boîte avait un overflow-hidden (pour
    // que le bandeau or épouse les coins arrondis) qui rognait aussi le
    // menu "Commissions concernées" de volunteer-needs-panel.tsx, positionné
    // en absolute et donc censé déborder de la boîte pour s'afficher
    // entièrement. Plus d'overflow-hidden sur le conteneur -- les coins
    // arrondis sont maintenant portés par le bouton lui-même (rounded-2xl
    // fermé, rounded-t-2xl ouvert, le corps n'ayant pas de fond coloré à
    // clipper).
    <div className="mt-3 rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors ${v.header} ${
          open ? "rounded-t-2xl" : "rounded-2xl"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${v.iconBadge}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-bold text-navy">{v.title}</span>
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-navy/15 bg-white text-navy">
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <div className="flex flex-col gap-3 p-3">{children}</div>}
    </div>
  );
}
