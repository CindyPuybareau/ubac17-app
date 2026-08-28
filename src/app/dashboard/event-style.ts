// Habillage et formats des événements. Volontairement hors de
// calendar-view : ce dernier porte "use client", et un composant serveur
// qui importe une fonction depuis un module client n'en reçoit qu'une
// référence — l'appeler pendant le rendu serveur lève une erreur. Les
// cartes du coach sont des composants serveur, elles ont besoin de ces
// fonctions pour de vrai.

import type { AdminUpcomingEvent } from "./page";

export const EVENT_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "TRAINING", label: "Entraînement" },
  { value: "MATCH", label: "Match officiel" },
  { value: "FRIENDLY", label: "Match amical" },
  { value: "TOURNAMENT", label: "Tournoi / Plateau" },
  { value: "OTHER", label: "Événement club" },
];

// Un code couleur par type, repris à l'identique partout (pastilles du
// calendrier, badges des cartes, bordure gauche). Palette de marque
// (direction artistique validée par Cindy le 2026-08-23) plutôt que des
// teintes Tailwind génériques : marine = match officiel (le plus
// solennel), bleu ciel = amical, or = tournoi/plateau (sort du lot), vert
// terrain = entraînement (le plus fréquent, le plus "normal"), parquet =
// événement club (fourre-tout chaleureux).
const typeStyles: Record<
  string,
  { pill: string; border: string; badge: string; label: string; dot: string }
> = {
  MATCH: {
    pill: "bg-navy/10 text-navy",
    border: "border-l-navy",
    badge: "bg-navy/10 text-navy",
    label: "Match officiel",
    // Couleur pleine, jamais la teinte pastel du pill (retour de Cindy du
    // 28/08, "on ne voit pas assez les petits points du calendrier") : une
    // pastille de 6px en bg-navy/10 est quasi invisible sur fond blanc —
    // ce que pill doit rester pour porter du texte devient illisible seul.
    // Même teinte que border (déjà pleine, jamais transparente).
    dot: "bg-navy",
  },
  FRIENDLY: {
    pill: "bg-sky-100 text-sky-700",
    border: "border-l-sky-400",
    badge: "bg-sky-100 text-sky-700",
    label: "Match amical",
    dot: "bg-sky-400",
  },
  TOURNAMENT: {
    pill: "bg-ubac-yellow/15 text-ubac-yellow-dark",
    border: "border-l-ubac-yellow",
    badge: "bg-ubac-yellow/15 text-ubac-yellow-dark",
    label: "Tournoi / Plateau",
    dot: "bg-ubac-yellow",
  },
  OTHER: {
    pill: "bg-parquet/15 text-parquet-dark",
    border: "border-l-parquet",
    badge: "bg-parquet/15 text-parquet-dark",
    label: "Événement club",
    dot: "bg-parquet",
  },
  TRAINING: {
    pill: "bg-court-green/10 text-court-green",
    border: "border-l-court-green",
    badge: "bg-court-green/10 text-court-green",
    label: "Entraînement",
    dot: "bg-court-green",
  },
};

export function styleFor(eventType: string | null) {
  return typeStyles[eventType ?? "OTHER"] ?? typeStyles.OTHER;
}

// Les deux types qui opposent le club à un adversaire : eux seuls
// affichent un nom d'adversaire et la mention domicile / extérieur.
export function isMatchType(eventType: string | null) {
  return eventType === "MATCH" || eventType === "FRIENDLY";
}

export function homeAwayLabel(isHome: boolean | null) {
  if (isHome === null) return null;
  return isHome ? "Domicile" : "Extérieur";
}

// "18h30" seul, ou "18h30 – 20h00" une fois l'heure de fin renseignée.
export function formatEventTime(startIso: string, endIso: string | null) {
  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`;
  };
  return endIso ? `${fmt(startIso)} – ${fmt(endIso)}` : fmt(startIso);
}

export function eventMapsQuery(event: Pick<AdminUpcomingEvent, "salle" | "location">) {
  const parts = [event.salle, event.location].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
