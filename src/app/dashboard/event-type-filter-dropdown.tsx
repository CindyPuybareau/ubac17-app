"use client";

import { useState } from "react";
import { ChevronDown, Home } from "lucide-react";
import { EVENT_TYPE_OPTIONS } from "./event-style";

// Remplace "Masquer les entraînements" (retour de Cindy du 10/09) : même
// principe que TeamFilterDropdown (case à cocher, "Tout cocher/décocher"),
// mais pour le type d'événement plutôt que l'équipe -- EVENT_TYPE_OPTIONS
// est la même liste que celle utilisée pour créer un événement
// (create-event-form.tsx), jamais dupliquée ici. FILTERABLE_TYPE_OPTIONS
// (retour de Cindy du 24/09, "supprimer Réunion Bureau [du filtre]") :
// exclut REUNION de la liste des cases à cocher SANS retirer l'entrée de
// EVENT_TYPE_OPTIONS lui-même (create-event-form.tsx en a besoin pour
// proposer "Réunion Bureau" à la création) -- une Réunion reste donc
// toujours visible sur le calendrier, plus jamais masquable par ce
// filtre, sur les 3 espaces qui partagent ce composant.
const FILTERABLE_TYPE_OPTIONS = EVENT_TYPE_OPTIONS.filter((t) => t.value !== "REUNION");
//
// hiddenTypes plutôt que "selectedTypes" (à l'inverse de TeamFilterDropdown)
// : la persistance côté compte (profiles.calendar_hidden_event_types)
// stocke ce qui est décoché, un tableau vide voulant dire "tout affiché" --
// même choix que hiddenTypes ici évite une conversion aller-retour à
// chaque lecture/écriture.
export default function EventTypeFilterDropdown({
  hiddenTypes,
  onChange,
  homeOnly,
  onHomeOnlyChange,
}: {
  hiddenTypes: Set<string>;
  onChange: (next: Set<string>) => void;
  // "Domicile seulement" (retour de Cindy du 24/09, "doit se trouver dans
  // l'onglet déroulant 'filtrer par'") : rejoint ce même menu plutôt que
  // son propre pill séparé -- undefined (Coach/Famille, jamais Bureau)
  // masque toute la section, ce filtre n'ayant de sens que pour qui voit
  // tout le club.
  homeOnly?: boolean;
  onHomeOnlyChange?: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  const activeCount = hiddenTypes.size + (homeOnly ? 1 : 0);
  const label = activeCount > 0 ? `Filtrer par (${activeCount})` : "Filtrer par";

  function toggle(value: string) {
    const next = new Set(hiddenTypes);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
          activeCount > 0
            ? "border-navy/30 bg-navy/10 text-navy"
            : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50"
        }`}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border border-zinc-100 bg-white p-3 shadow-lg">
            {onHomeOnlyChange && (
              <>
                <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={homeOnly ?? false}
                    onChange={() => onHomeOnlyChange(!homeOnly)}
                    className="h-4 w-4 shrink-0 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                  />
                  <Home className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <span>Domicile seulement</span>
                </label>
                <div className="my-2 border-t border-zinc-100" />
              </>
            )}
            <div className="mb-2 flex gap-2">
              <button
                onClick={() => onChange(new Set())}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Tout cocher
              </button>
              <button
                onClick={() => onChange(new Set(FILTERABLE_TYPE_OPTIONS.map((t) => t.value)))}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Tout décocher
              </button>
            </div>
            <ul className="flex flex-col gap-0.5">
              {FILTERABLE_TYPE_OPTIONS.map((t) => (
                <li key={t.value}>
                  <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      checked={!hiddenTypes.has(t.value)}
                      onChange={() => toggle(t.value)}
                      className="h-4 w-4 shrink-0 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                    />
                    <span className="truncate">{t.label}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
