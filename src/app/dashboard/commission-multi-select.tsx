"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Retour de Cindy du 10/09 (suite) : "Commissions concernées" sur un besoin
// d'organisation, sélection multiple possible (ex. table de marque :
// Coachs ET Team Communication) -- même style de dropdown que
// TeamFilterDropdown/EventTypeFilterDropdown (bordure, ombre, chevron,
// aucune animation d'ouverture, cohérent avec les autres dropdowns de
// l'appli). Utilisé à la fois dans create-event-form.tsx (par besoin, à la
// création) et volunteer-needs-panel.tsx (à l'ajout sur un événement déjà
// créé) -- un seul composant plutôt que deux copies.
export default function CommissionMultiSelect({
  commissions,
  selectedIds,
  onChange,
}: {
  commissions: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const label =
    selectedIds.length === 0
      ? "Commissions concernées"
      : `Commissions (${selectedIds.length})`;

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  if (commissions.length === 0) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 rounded-full border px-2 py-1.5 text-xs font-medium transition-colors ${
          selectedIds.length > 0
            ? "border-navy/30 bg-navy/10 text-navy"
            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
        }`}
      >
        {label}
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-zinc-100 bg-white p-3 shadow-lg">
            <ul className="flex flex-col gap-0.5">
              {commissions.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(c.id)}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 shrink-0 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                    />
                    <span className="truncate">{c.name}</span>
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
