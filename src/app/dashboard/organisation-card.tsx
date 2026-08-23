"use client";

import { useState } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import type { ReactNode } from "react";

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
export default function OrganisationCard({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-ubac-yellow/15 px-3 py-2 text-left transition-colors hover:bg-ubac-yellow/25"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ubac-yellow text-navy">
            <ClipboardList className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-bold text-navy">Organisation</span>
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
