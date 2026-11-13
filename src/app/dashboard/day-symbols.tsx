"use client";

import {
  Cake,
  CalendarDays,
  Dumbbell,
  Handshake,
  Sparkles,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

// Symboles des cases du calendrier (retour de Cindy du 13/11, "au lieu des
// points, un joli symbole... il faut que ce soit clair pour tous les
// espaces") : un symbole par TYPE d'événement présent ce jour-là, avec un
// petit chiffre s'il y en a plusieurs (une case de téléphone fait ~45 px :
// regrouper évite tout débordement, même avec les 17 équipes du Bureau).
// Partagé par calendar-view.tsx (Bureau / Coach / Famille) et l'espace
// Enfant (child-calendar-tab.tsx) -- mêmes symboles, mêmes couleurs partout,
// mêmes que les pastilles de type déjà utilisées dans l'appli.
export const EVENT_SYMBOLS: Record<string, { Icon: LucideIcon; color: string; label: string }> = {
  TRAINING: { Icon: Dumbbell, color: "text-court-green", label: "Entraînement" },
  MATCH: { Icon: Trophy, color: "text-navy", label: "Match officiel" },
  FRIENDLY: { Icon: Handshake, color: "text-sky-500", label: "Match amical" },
  TOURNAMENT: { Icon: Sparkles, color: "text-ubac-yellow-dark", label: "Tournoi / Plateau" },
  REUNION: { Icon: Users, color: "text-plum", label: "Réunion" },
  OTHER: { Icon: CalendarDays, color: "text-parquet-dark", label: "Événement club" },
};
const ORDER = ["MATCH", "FRIENDLY", "TOURNAMENT", "TRAINING", "REUNION", "OTHER"];

export function symbolFor(eventType: string | null) {
  return EVENT_SYMBOLS[eventType ?? "OTHER"] ?? EVENT_SYMBOLS.OTHER;
}

export type DaySymbolItem = {
  eventType: string | null;
  cancelled: boolean;
  // Résultat connu d'un match : colore le symbole (vert / rouge).
  result?: "win" | "loss" | "draw" | null;
};

export function DaySymbols({ items }: { items: DaySymbolItem[] }) {
  if (items.length === 0) return null;
  const groups = ORDER.map((type) => {
    const list = items.filter((i) => (EVENT_SYMBOLS[i.eventType ?? "OTHER"] ? i.eventType ?? "OTHER" : "OTHER") === type);
    return { type, list };
  }).filter((g) => g.list.length > 0);

  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {groups.map(({ type, list }) => {
        const { Icon, color, label } = EVENT_SYMBOLS[type];
        const active = list.filter((i) => !i.cancelled);
        const allCancelled = active.length === 0;
        const scored = active.filter((i) => i.result);
        const wins = scored.filter((i) => i.result === "win").length;
        const losses = scored.filter((i) => i.result === "loss").length;
        // Couleur du résultat seulement quand TOUS les matchs du groupe sont
        // joués et vont dans le même sens ; sinon la couleur du type.
        const resultColor =
          scored.length > 0 && scored.length === active.length && wins === scored.length
            ? "text-emerald-600"
            : scored.length > 0 && scored.length === active.length && losses === scored.length
              ? "text-red-500"
              : null;
        const title = [
          `${list.length} ${label.toLowerCase()}${list.length > 1 ? "s" : ""}`,
          allCancelled ? "annulé" : null,
          wins > 0 ? `${wins} victoire${wins > 1 ? "s" : ""}` : null,
          losses > 0 ? `${losses} défaite${losses > 1 ? "s" : ""}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <span
            key={type}
            title={title}
            className={`inline-flex items-center gap-px ${allCancelled ? "opacity-35" : ""}`}
          >
            {/* Pas de cercle autour du symbole (retour de Cindy du 13/11, "on
                ne comprend pas le cercle") : le symbole seul. */}
            <Icon className={`h-3 w-3 ${allCancelled ? "text-zinc-400" : (resultColor ?? color)}`} aria-label={title} />
            {list.length > 1 && (
              <span className="text-[9px] font-bold leading-none tabular-nums text-zinc-500">{list.length}</span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// Gâteau en haut à droite de la case, en face du numéro du jour (retour de
// Cindy du 13/11 : d’abord en bas à droite, "il dérange") -- à part des
// entraînements / matchs / événements. La case doit être `relative`.
export function BirthdayCorner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      title={`${count} anniversaire${count > 1 ? "s" : ""}`}
      // Centré sur la même ligne que le numéro du jour (retour de Cindy du
      // 13/11, "même hauteur que les chiffres, un poil plus petit") :
      // numéro = rond de 20 px à 4 px du bord (24 px à 8 px sur grand
      // écran) ; gâteau de 10 px (12 px) placé au milieu de cette hauteur.
      className="absolute right-1 top-[9px] inline-flex items-center sm:right-2 sm:top-[14px]"
    >
      {/* Jamais de chiffre pour les anniversaires (retour de Cindy du
          13/11) : le gâteau seul, le détail s'affiche en ouvrant le jour. */}
      <Cake className="h-2.5 w-2.5 text-pink-500 sm:h-3 sm:w-3" aria-label="Anniversaire" />
    </span>
  );
}
