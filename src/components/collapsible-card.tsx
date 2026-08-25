"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Généralisation de dashboard/organisation-card.tsx (même habillage —
// bandeau or, badge icône carré, titre en gras, replié par défaut — mais
// icône/titre paramétrables au lieu d'être figés sur "Organisation").
// N'a pas remplacé organisation-card.tsx lui-même (déjà utilisé à 4
// endroits, risque inutile) : un composant sœur avec le même rendu visuel.
export default function CollapsibleCard({
  icon: Icon,
  title,
  badge,
  defaultOpen = false,
  children,
}: {
  icon: LucideIcon;
  title: string;
  // Pastille optionnelle à droite du titre (ex. "Saison 2026-2027").
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-ubac-yellow/15 px-3 py-2.5 text-left transition-colors hover:bg-ubac-yellow/25"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-ubac-yellow text-navy">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-sm font-bold text-navy">{title}</span>
          {badge && (
            <span className="shrink-0 rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy">
              {badge}
            </span>
          )}
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-navy/15 bg-white text-navy">
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open && <div className="flex flex-col gap-4 p-4">{children}</div>}
    </div>
  );
}
