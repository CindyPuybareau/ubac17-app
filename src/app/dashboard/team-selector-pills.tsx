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
//
// Habillage aligné sur le sélecteur d'enfant de l'espace Famille (retour
// de Cindy du 2026-08-24 : "les onglets existants bleu se présente plus
// comme la première capture") — pastille-avatar colorée à gauche plutôt
// qu'une icône nue, actif = fond teinté + anneau plutôt qu'un aplat navy
// plein, en gardant toutes les infos déjà là (icône de rôle, libellé,
// badge Coach/Joueur).
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
        // Couleur de la pastille dérivée du rôle — même logique que le
        // badge Coach/Joueur juste à droite, pour que les deux se
        // répondent visuellement au lieu de choisir une teinte au hasard.
        const badgeColor =
          t.role === "PLAYER" ? "bg-emerald-500" : t.role === "COACH" ? "bg-navy" : "bg-zinc-400";
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-medium transition-colors ${
              isActive
                ? "border-navy/30 bg-navy/10 ring-2 ring-navy/20"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${badgeColor}`}
            >
              {t.role === "PLAYER" ? (
                <Shirt className="h-3.5 w-3.5" />
              ) : t.role === "COACH" ? (
                <ClipboardList className="h-3.5 w-3.5" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
            </span>
            <span className={isActive ? "font-semibold text-navy" : ""}>{teamLabel(t)}</span>
            {t.role && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none ${
                  t.role === "PLAYER" ? "bg-emerald-100 text-emerald-700" : "bg-navy/10 text-navy"
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
