"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

// Boîte partagée "Organisation" (Maillots/Table de marque + Besoins
// d'organisation) — jusqu'ici un simple <div> répété à l'identique dans
// calendar-view.tsx, coach-next-match-card.tsx et next-convocation-card.tsx.
// Rétractable (retour de Cindy du 2026-08-21) : la carte peut vite
// s'allonger (plusieurs rôles + plusieurs besoins), la plupart du temps on
// n'a pas besoin de la garder ouverte en permanence. Ouverte par défaut —
// ne change rien pour qui ne touche jamais au chevron.
export default function OrganisationCard({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"
      >
        Organisation
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  );
}
