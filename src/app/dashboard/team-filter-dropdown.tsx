"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { teamLabel } from "@/lib/teams";

export type TeamOption = {
  id: string;
  name: string | null;
  category: string | null;
};

export default function TeamFilterDropdown({
  teams,
  selectedIds,
  onChange,
}: {
  teams: TeamOption[];
  selectedIds: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);

  const allSelected = selectedIds.size === teams.length;
  const label = allSelected
    ? "Toutes les équipes"
    : selectedIds.size === 0
      ? "Aucune équipe"
      : `Équipes (${selectedIds.size})`;

  function toggle(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        {label}
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 z-40 mt-2 max-h-80 w-72 overflow-y-auto rounded-2xl border border-zinc-100 bg-white p-3 shadow-lg">
            <div className="mb-2 flex gap-2">
              <button
                onClick={() => onChange(new Set(teams.map((t) => t.id)))}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Tout sélectionner
              </button>
              <button
                onClick={() => onChange(new Set())}
                className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Tout décocher
              </button>
            </div>
            <ul className="flex flex-col gap-0.5">
              {teams.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-zinc-50">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(t.id)}
                      onChange={() => toggle(t.id)}
                      className="h-4 w-4 shrink-0 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                    />
                    <span className="truncate">{teamLabel(t)}</span>
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
