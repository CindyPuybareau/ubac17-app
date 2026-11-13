"use client";

import { useState } from "react";
import {
  Cake,
  CalendarDays,
  ChevronDown,
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
  // Anneau autour du symbole : "warn" = besoin d'organisation non pourvu
  // (orange), "home" = match à domicile (doré, espace Enfant).
  ring?: "warn" | "home" | null;
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
        const ring = active.some((i) => i.ring === "warn")
          ? "ring-1 ring-amber-500"
          : active.some((i) => i.ring === "home")
            ? "ring-1 ring-ubac-yellow"
            : "";
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
            <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-full ${ring}`}>
              <Icon className={`h-3 w-3 ${allCancelled ? "text-zinc-400" : (resultColor ?? color)}`} aria-label={title} />
            </span>
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

// Légende repliable sous la grille (retour de Cindy du 13/11) : la même
// partout, avec seulement les repères qui existent sur ce calendrier.
export function SymbolLegend({ showWarn = false, showHome = false }: { showWarn?: boolean; showHome?: boolean }) {
  const [open, setOpen] = useState(false);
  const entries: { key: string; node: React.ReactNode; label: string }[] = [
    ...ORDER.map((type) => {
      const { Icon, color, label } = EVENT_SYMBOLS[type];
      return { key: type, node: <Icon className={`h-3.5 w-3.5 ${color}`} />, label };
    }),
    {
      key: "result",
      node: (
        <span className="flex items-center gap-0.5">
          <Trophy className="h-3.5 w-3.5 text-emerald-600" />
          <Trophy className="h-3.5 w-3.5 text-red-500" />
        </span>
      ),
      label: "Match gagné / perdu",
    },
    { key: "bday", node: <Cake className="h-3.5 w-3.5 text-pink-500" />, label: "Anniversaire (en haut à droite)" },
    {
      key: "count",
      node: (
        <span className="flex items-center gap-px">
          <Dumbbell className="h-3.5 w-3.5 text-court-green" />
          <span className="text-[10px] font-bold text-zinc-500">2</span>
        </span>
      ),
      label: "Chiffre = plusieurs ce jour-là",
    },
    {
      key: "cancel",
      node: <Dumbbell className="h-3.5 w-3.5 text-zinc-400 opacity-50" />,
      label: "Grisé = annulé",
    },
    ...(showWarn
      ? [
          {
            key: "warn",
            node: (
              <span className="flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-amber-500">
                <Trophy className="h-3 w-3 text-navy" />
              </span>
            ),
            label: "Contour orange = besoin d'organisation",
          },
        ]
      : []),
    ...(showHome
      ? [
          {
            key: "home",
            node: (
              <span className="flex h-4 w-4 items-center justify-center rounded-full ring-1 ring-ubac-yellow">
                <Trophy className="h-3 w-3 text-navy" />
              </span>
            ),
            label: "Contour doré = match à domicile",
          },
        ]
      : []),
  ];
  return (
    <div className="rounded-xl border border-zinc-100 bg-white/70">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-zinc-600"
      >
        Que veulent dire les symboles ?
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 px-3 pb-3 min-[400px]:grid-cols-2">
          {entries.map((e) => (
            <li key={e.key} className="flex items-center gap-2 text-xs text-zinc-700">
              <span className="flex w-8 shrink-0 justify-center">{e.node}</span>
              {e.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
