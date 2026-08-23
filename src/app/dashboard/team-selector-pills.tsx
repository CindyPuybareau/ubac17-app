import { ClipboardList, Shirt, Users } from "lucide-react";
import { teamLabel } from "@/lib/teams";

export type TeamSelectorEntry = {
  id: string;
  name: string | null;
  category: string | null;
  // Bureau (ni coach ni joueur de cette équipe précise) : icône neutre,
  // pas de badge — laisser le champ absent plutôt que d'inventer un rôle.
  role?: "COACH" | "PLAYER";
};

// Sélecteur d'équipe façon pastilles, utilisé aux deux endroits où il faut
// choisir quelle équipe regarder quand on en a plusieurs — "Mes Équipes"
// (coach-teams.tsx) et "Résultats" (calendar-view.tsx). Auparavant deux
// copies quasi identiques ; celle-ci couvre les deux cas (le rôle est
// optionnel, calendar-view.tsx l'omet côté Bureau).
export default function TeamSelectorPills({
  teams,
  activeId,
  onSelect,
}: {
  // Déjà triée par l'appelant (sortTeamsByGroup) : ce composant ne fait
  // que l'affichage, pas le tri.
  teams: TeamSelectorEntry[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (teams.length <= 1) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {teams.map((t) => {
        const isActive = activeId === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              isActive
                ? "border-navy bg-navy text-white"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {t.role === "PLAYER" ? (
              <Shirt className="h-3.5 w-3.5 shrink-0" />
            ) : t.role === "COACH" ? (
              <ClipboardList className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Users className="h-3.5 w-3.5 shrink-0" />
            )}
            {teamLabel(t)}
            {t.role && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${
                  isActive
                    ? "bg-white/20 text-white"
                    : t.role === "PLAYER"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-navy/10 text-navy"
                }`}
              >
                {t.role === "PLAYER" ? "Joueur" : "Coach"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
