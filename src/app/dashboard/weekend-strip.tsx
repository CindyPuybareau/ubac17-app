"use client";

import { useState } from "react";
import { ChevronDown, Home, MapPin, Megaphone, Trophy } from "lucide-react";
import { parseMatchTitle, resolveIsHome } from "@/lib/match-display";
import SalleBadge from "./salle-badge";
import { SALLES } from "./salles";

// Week-end au club en haut du calendrier (retour de Cindy du 13/11).
// - "bureau" : tous les matchs du week-end (17 équipes), résumé dépliable,
//   par jour, adversaire en entier, Domicile / Extérieur.
// - "club" (Coach / Famille / Enfant) : "Venez encourager !" -- seulement
//   les matchs officiels À DOMICILE de TOUT le club ce week-end, même ceux
//   d'équipes qui ne les concernent pas ("ils peuvent venir").
// Un appui sur un match ouvre son jour dans la grille du mois (quand le
// calendrier le permet).
export type WeekendMatch = {
  id: string;
  dayKey: string;
  startTime: string;
  endTime: string | null;
  teamName: string | null;
  opponent: string | null;
  isHome: boolean | null;
  isTournament: boolean;
  place: { label: string; isClubSalle: boolean } | null;
};

// Champs minimaux communs aux événements du calendrier (Bureau/Coach/
// Famille) et de l'espace Enfant -- un seul calcul pour tous.
export type WeekendSourceEvent = {
  id: string;
  eventType: string | null;
  startTime: string;
  endTime: string | null;
  title: string | null;
  teamName: string | null;
  isHome: boolean | null;
  salle: string | null;
  location: string | null;
  // Adresse de la salle venue de la FFBB -- renseignée aussi pour les
  // matchs à domicile ("COMPLEXE SPORTIF DE CHATELAILLON, ...").
  awayVenueAddress: string | null;
  cancelledAt: string | null;
};

// Quel gymnase (retour de Cindy du 13/11, "on a plusieurs gymnases à
// domicile") : la salle choisie dans l'appli si elle existe, sinon une de
// nos trois salles reconnue dans l'adresse FFBB, sinon le nom du lieu tel
// que donné par la FFBB (partie avant la première virgule).
function normalize(text: string) {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
export function gymLabel(e: Pick<WeekendSourceEvent, "salle" | "location" | "awayVenueAddress">): {
  label: string;
  isClubSalle: boolean;
} | null {
  if (e.salle) return { label: e.salle, isClubSalle: (SALLES as readonly string[]).includes(e.salle) };
  if (e.awayVenueAddress) {
    const haystack = normalize(e.awayVenueAddress);
    const known = SALLES.find((s) => haystack.includes(normalize(s).replace(/-/g, " ")) || haystack.includes(normalize(s)));
    if (known) return { label: known, isClubSalle: true };
    const name = e.awayVenueAddress.split(",")[0].trim();
    if (name) {
      const pretty = name.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (m) => m.toUpperCase());
      return { label: pretty, isClubSalle: false };
    }
  }
  if (e.location && !/^(domicile|ext[ée]rieur)$/i.test(e.location.trim())) {
    return { label: e.location, isClubSalle: false };
  }
  return null;
}

function dayKeyOf(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Samedi 00:00 -> lundi 00:00 du week-end qui vient (ou en cours le
// week-end), à partir de l'instant donné.
export function weekendWindow(now: Date): { start: Date; end: Date } {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = base.getDay();
  const start = new Date(base);
  start.setDate(base.getDate() + (dow === 0 ? -1 : 6 - dow));
  const end = new Date(start);
  end.setDate(start.getDate() + 2);
  return { start, end };
}

// Matchs (et tournois) du week-end, pas annulés, pas encore terminés.
export function buildWeekendMatches(events: WeekendSourceEvent[], now: Date): WeekendMatch[] {
  const { start, end } = weekendWindow(now);
  const isMatch = (t: string | null) => t === "MATCH" || t === "FRIENDLY";
  return events
    .filter((e) => {
      if (e.cancelledAt) return false;
      if (!isMatch(e.eventType) && e.eventType !== "TOURNAMENT") return false;
      const s = new Date(e.startTime);
      if (s < start || s >= end) return false;
      const finish = e.endTime ? new Date(e.endTime).getTime() : s.getTime() + 2 * 60 * 60 * 1000;
      return finish > now.getTime();
    })
    .map((e) => ({
      id: e.id,
      dayKey: dayKeyOf(new Date(e.startTime)),
      startTime: e.startTime,
      endTime: e.endTime,
      teamName: e.teamName,
      opponent: isMatch(e.eventType) ? parseMatchTitle(e.title).opponent : (e.title ?? null),
      isHome: isMatch(e.eventType) ? resolveIsHome({ isHome: e.isHome, title: e.title, salle: e.salle }) : null,
      isTournament: e.eventType === "TOURNAMENT",
      place: gymLabel(e),
    }));
}

function timeLabel(iso: string) {
  return new Date(iso)
    .toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })
    .replace(":", "h");
}

function dayLabel(iso: string) {
  const label = new Date(iso).toLocaleDateString("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Couleurs Domicile (vert) / Extérieur (bleu UBAC) : les mêmes que les
// cartes du calendrier (homeAwayColorClass, event-style.ts).
// Pastille au texte bien centré (retour de Cindy du 13/11, "attention à
// bien centrer les textes au truc qui les entoure") : inline-flex centré
// sur les deux axes, interligne à 1.
const PILL = "inline-flex h-5 shrink-0 items-center justify-center gap-1 rounded-full px-2 text-[10px] font-bold uppercase leading-none";

export default function WeekendStrip({
  matches,
  onSelectDay,
  variant = "bureau",
}: {
  matches: WeekendMatch[];
  onSelectDay?: (dayKey: string) => void;
  variant?: "bureau" | "club";
}) {
  const isClub = variant === "club";
  // Toujours replié à l'ouverture, sur tous les espaces (retour de Cindy du
  // 13/11) : on le déplie seulement si on le souhaite.
  const [open, setOpen] = useState(false);
  const shown = isClub ? matches.filter((m) => m.isHome === true) : matches;
  if (shown.length === 0) return null;

  const homeCount = shown.filter((m) => m.isHome === true).length;
  const days = Array.from(new Set([...shown].sort((a, b) => a.startTime.localeCompare(b.startTime)).map((m) => m.dayKey)));
  const byDay = days.map((dayKey) => ({
    dayKey,
    matches: shown
      .filter((m) => m.dayKey === dayKey)
      .sort((a, b) => {
        const homeA = a.isHome === true ? 0 : 1;
        const homeB = b.isHome === true ? 0 : 1;
        return homeA - homeB || a.startTime.localeCompare(b.startTime);
      }),
  }));

  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm border-navy/10`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
          // Même bandeau bleu marine pour tous (retour de Cindy du 13/11,
          // "pas sexy ce bloc jaune") : le jaune club reste en accent
          // (icône, petit titre, liseré).
          isClub
            ? "border-b-2 border-ubac-yellow bg-gradient-to-br from-navy via-navy to-navy-dark"
            : "bg-gradient-to-br from-navy via-navy to-navy-dark"
        }`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ${
              "bg-ubac-yellow text-navy"
            }`}
          >
            {isClub ? <Megaphone className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className={`whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-ubac-yellow`}>
              {isClub ? "Venez encourager !" : "Ce week-end au club"}
            </span>
            <span className="truncate whitespace-nowrap text-base font-bold text-white">
              {isClub
                ? `${shown.length} match${shown.length > 1 ? "s" : ""} à domicile ce WE`
                : `${shown.length} match${shown.length > 1 ? "s" : ""}`}
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {!isClub && homeCount > 0 && (
            <span className="inline-flex h-6 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full bg-white/15 px-2.5 text-[11px] font-semibold leading-none text-white">
              <Home className="h-3 w-3" />
              {homeCount} à domicile
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""} text-white/80`}
          />
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 p-3">
          {byDay.map(({ dayKey, matches: dayMatches }) => (
            <div key={dayKey} className="flex flex-col gap-1.5">
              <p className="px-1 text-[11px] font-bold uppercase tracking-wide text-zinc-900">
                {dayLabel(dayMatches[0].startTime)}
              </p>
              <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {dayMatches.map((m) => {
                  const home = m.isHome === true;
                  const content = (
                    <>
                      <span className="w-12 shrink-0 pt-0.5 text-sm font-bold tabular-nums text-navy">
                        {timeLabel(m.startTime)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold uppercase tracking-wide text-ubac-blue">{m.teamName}</span>
                          {!isClub && (
                            <span className={`${PILL} ${
                              home ? "bg-green-700 text-white" : m.isHome === false ? "bg-ubac-blue text-white" : "bg-zinc-100 text-zinc-500"
                            }`}>
                              {home ? <Home className="h-3 w-3" /> : <MapPin className="h-3 w-3" />}
                              {home ? "Domicile" : m.isHome === false ? "Extérieur" : "Lieu ?"}
                            </span>
                          )}
                        </span>
                        {/* Adversaire en entier, sur sa propre ligne. */}
                        <span className="break-words text-sm font-semibold leading-snug text-zinc-900">
                          {m.isTournament ? "Tournoi" : (m.opponent ?? "Match")}
                        </span>
                        {home && m.place && (
                          <span className="mt-0.5 flex items-center gap-1">
                            {m.place.isClubSalle ? (
                              <SalleBadge salle={m.place.label} />
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-zinc-500">
                                <MapPin className="h-3 w-3 shrink-0" />
                                <span className="truncate">{m.place.label}</span>
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </>
                  );
                  const className = `flex items-start gap-3 rounded-xl border border-l-4 px-3 py-2 text-left ${
                    home
                      ? "border-green-700/20 border-l-green-700 bg-green-50/60"
                      : m.isHome === false
                        ? "border-ubac-blue/15 border-l-ubac-blue bg-white"
                        : "border-zinc-100 border-l-zinc-300 bg-white"
                  }`;
                  return onSelectDay ? (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onSelectDay(m.dayKey)}
                      className={`${className} transition-colors hover:bg-zinc-50`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={m.id} className={className}>
                      {content}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
