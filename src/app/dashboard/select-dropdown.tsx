"use client";

import { useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
};

// Retour de Cindy du 14/09 ("Toutes les équipes" du Calendrier et "Tous
// les statuts" de Cotisations ne se ressemblent toujours pas") : un
// <select> natif rend toujours différemment d'un bouton stylé à la
// main (hauteur/flèche/largeur dépendantes du navigateur/OS) -- ce
// composant reproduit exactement le bouton pilule de TeamFilterDropdown
// (même classes, même ChevronDown) pour n'importe quelle liste
// d'options à sélection UNIQUE (équipe, statut...), pour qu'il n'existe
// plus qu'UNE seule implémentation de "ce type de menu déroulant" dans
// toute l'appli -- plutôt que de réécrire ce bouton à chaque nouvel
// écran qui en a besoin.
export default function SelectDropdown({
  options,
  value,
  onChange,
  compact = false,
  icon: Icon,
}: {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
  // Retour de Cindy du 30/10 ("même taille et design que celui d'équipe...
  // avec un symbole photo devant") : TeamFilterDropdown a toujours une
  // icône (Users) devant son libellé, ce bouton n'en avait aucune --
  // optionnel pour ne rien changer aux appelants existants (cotisation-
  // participants-table.tsx, members-table.tsx) qui n'en passent pas.
  icon?: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find((o) => o.value === value)?.label ?? "";

  function select(v: string) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50 ${
          compact ? "px-3 py-1 text-xs" : "px-3 py-1.5 text-sm"
        }`}
      >
        {Icon && <Icon className={compact ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"} />}
        <span className="max-w-[45vw] truncate sm:max-w-[180px]">{label}</span>
        <ChevronDown className={compact ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border border-zinc-100 bg-white p-1.5 shadow-lg">
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                  value === o.value ? "font-semibold text-navy" : "text-zinc-700"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
