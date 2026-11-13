"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Home, Megaphone, Trophy } from "lucide-react";
import MatchCountdown from "./match-countdown";

// "Ce week-end au club" en haut du calendrier (retour de Cindy du 13/11,
// "calendrier fun, funky et sexy") : les matchs du week-end qui vient (ou
// en cours), matchs à domicile en premier.
// - Coach / Famille / Enfant : petites cartes qu'on fait défiler du doigt,
//   avec compte à rebours et "Venez encourager !" sur les matchs à domicile.
// - Bureau (17 équipes, "le calendrier va être saturé") : une seule ligne de
//   résumé "14 matchs · 5 à domicile", dépliable en liste compacte.
// Un appui sur un match sélectionne son jour dans la grille du mois.
export type WeekendMatch = {
  id: string;
  dayKey: string;
  startTime: string;
  endTime: string | null;
  teamName: string | null;
  opponent: string | null;
  isHome: boolean | null;
  isTournament: boolean;
};

function dayTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "short" });
  const time = d.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${time.replace(":", "h")}`;
}

export default function WeekendStrip({
  matches,
  compact,
  onSelectDay,
}: {
  matches: WeekendMatch[];
  // Bureau : résumé dépliable plutôt que des cartes.
  compact: boolean;
  onSelectDay: (dayKey: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (matches.length === 0) return null;

  // Domicile d'abord, puis par heure.
  const sorted = [...matches].sort((a, b) => {
    const homeA = a.isHome === true ? 0 : 1;
    const homeB = b.isHome === true ? 0 : 1;
    return homeA - homeB || a.startTime.localeCompare(b.startTime);
  });
  const homeCount = matches.filter((m) => m.isHome === true).length;

  const title = (
    <span className="flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ubac-yellow text-navy">
        <Trophy className="h-3.5 w-3.5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-ubac-yellow">Ce week-end au club</span>
        <span className="text-sm font-semibold text-white">
          {matches.length} match{matches.length > 1 ? "s" : ""}
          {homeCount > 0 && (
            <span className="font-normal text-white/80">
              {" "}
              · {homeCount} à domicile
            </span>
          )}
        </span>
      </span>
    </span>
  );

  if (compact) {
    return (
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-navy via-navy to-navy-dark shadow-sm">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          {title}
          <span className="flex items-center gap-1 text-xs font-medium text-white/80">
            {open ? "Masquer" : "Voir"}
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </button>
        {open && (
          <ul className="divide-y divide-zinc-100 bg-white">
            {sorted.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => onSelectDay(m.dayKey)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-zinc-50"
                >
                  <span className="w-20 shrink-0 text-xs font-semibold text-zinc-500">{dayTime(m.startTime)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-ubac-blue">{m.teamName}</span>
                    {m.opponent && <span className="text-zinc-700"> · {m.opponent}</span>}
                  </span>
                  {m.isHome === true && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-court-green/10 px-2 py-0.5 text-[10px] font-bold uppercase text-court-green">
                      <Home className="h-3 w-3" />
                      Domicile
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-navy via-navy to-navy-dark p-3 shadow-sm">
      <div className="px-1 pb-2.5">{title}</div>
      <div className="-mx-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sorted.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelectDay(m.dayKey)}
            className={`flex w-[13.5rem] shrink-0 snap-start flex-col gap-1.5 rounded-xl p-3 text-left shadow-sm transition-transform active:scale-[0.98] ${
              m.isHome === true ? "bg-ubac-yellow text-navy" : "bg-white text-zinc-900"
            }`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className={`truncate text-[11px] font-bold uppercase tracking-wide ${m.isHome === true ? "text-navy" : "text-ubac-blue"}`}>
                {m.teamName}
              </span>
              <MatchCountdown startTime={m.startTime} endTime={m.endTime} onYellow={m.isHome === true} />
            </span>
            <span className="truncate text-sm font-bold">{m.isTournament ? "Tournoi" : (m.opponent ?? "Match")}</span>
            <span className={`text-xs font-medium ${m.isHome === true ? "text-navy/80" : "text-zinc-500"}`}>
              {dayTime(m.startTime)}
              {m.isHome === true ? " · À domicile" : m.isHome === false ? " · Extérieur" : ""}
            </span>
            {m.isHome === true && (
              <span className="mt-0.5 flex w-fit items-center gap-1 rounded-full bg-navy px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ubac-yellow">
                <Megaphone className="h-3 w-3" />
                Venez encourager !
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
