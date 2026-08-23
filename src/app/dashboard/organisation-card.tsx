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
// espaces") — l'inverse du choix précédent : la carte se voulait discrète
// jusqu'ici, elle prenait en pratique trop de place ouverte par défaut.
export default function OrganisationCard({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      {/* Bleu + icône devant le libellé (retour de Cindy du 2026-08-23,
          "doit etre plus visible (bleu??? avec un petit symbole a ajouter
          devant)") : avant, un texte gris discret sans repère visuel se
          fondait dans le reste de la carte — même souci que la flèche
          trop discrète corrigé le 2026-08-21 (juste en dessous). */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-navy transition-colors hover:text-navy-dark"
      >
        <span className="flex items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5 shrink-0" />
          Organisation
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy/10 text-navy">
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  );
}
