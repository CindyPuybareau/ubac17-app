"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { teamLabel } from "@/lib/teams";
import type { TeamOption } from "./team-filter-dropdown";

// Retour de Cindy du 14/09 ("le menu 'Toutes les équipes' n'est pas top
// niveau responsive et n'est pas de la même taille que ceux du
// calendrier") : ce filtre (Membres) était un <select> natif -- son
// rendu (hauteur, flèche, largeur) dépend entièrement du navigateur/OS,
// jamais tout à fait la même taille qu'un bouton stylé à la main comme
// TeamFilterDropdown, déjà utilisé par le Calendrier/l'onglet Équipes.
// Même bouton, même classes, même ChevronDown -- mais liste à sélection
// UNIQUE (une équipe à la fois, ou "Toutes les équipes") plutôt que des
// cases à cocher : ce filtre-ci reste un OU exclusif, pas un multi-choix.
export default function TeamSelectDropdown({
  teams,
  selectedId,
  onChange,
  allLabel = "Toutes les équipes",
}: {
  teams: TeamOption[];
  selectedId: string;
  onChange: (id: string) => void;
  allLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedTeam = teams.find((t) => t.id === selectedId);
  const label = selectedTeam ? teamLabel(selectedTeam) : allLabel;

  function select(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        <span className="max-w-[45vw] truncate sm:max-w-[180px]">{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-40 mt-2 max-h-80 w-64 overflow-y-auto rounded-2xl border border-zinc-100 bg-white p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => select("")}
              className={`w-full rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                selectedId === "" ? "font-semibold text-navy" : "text-zinc-700"
              }`}
            >
              {allLabel}
            </button>
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => select(t.id)}
                className={`w-full truncate rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-zinc-50 ${
                  selectedId === t.id ? "font-semibold text-navy" : "text-zinc-700"
                }`}
              >
                {teamLabel(t)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
