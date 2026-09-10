"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { EVENT_TYPE_OPTIONS } from "./event-style";

// Remplace "Masquer les entraînements" (retour de Cindy du 10/09) : même
// principe que TeamFilterDropdown (case à cocher, "Tout cocher/décocher"),
// mais pour le type d'événement plutôt que l'équipe -- EVENT_TYPE_OPTIONS
// est la même liste que celle utilisée pour créer un événement
// (create-event-form.tsx), jamais dupliquée ici.
//
// hiddenTypes plutôt que "selectedTypes" (à l'inverse de TeamFilterDropdown)
// : la persistance côté compte (profiles.calendar_hidden_event_types)
// stocke ce qui est décoché, un tableau vide voulant dire "tout affiché" --
// même choix que hiddenTypes ici évite une conversion aller-retour à
// chaque lecture/écriture.
export default function EventTypeFilterDropdown({
  hiddenTypes,
  onChange,
}: {
  hiddenTypes: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  const hiddenCount = hiddenTypes.size;
  const label = hiddenCount > 0 ? `Filtrer par type (${hiddenCount})` : "Filtrer par type";

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
          hiddenCount > 0
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
            <div className="mb-2 flex gap-2">
              <button
                onClick={() => onChange(new Set())}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Tout cocher
              </button>
              <button
                onClick={() => onChange(new Set(EVENT_TYPE_OPTIONS.map((t) => t.value)))}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Tout décocher
              </button>
            </div>
            <ul className="flex flex-col gap-0.5">
              {EVENT_TYPE_OPTIONS.map((t) => (
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
