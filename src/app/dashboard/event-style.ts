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
// calendrier, badges des cartes, bordure gauche) : rouge = match officiel,
// bleu = amical, orange = tournoi, vert = entraînement.
const typeStyles: Record<
  string,
  { pill: string; border: string; badge: string; label: string }
> = {
  MATCH: {
    pill: "bg-red-100 text-red-700",
    border: "border-l-red-400",
    badge: "bg-red-100 text-red-700",
    label: "Match officiel",
  },
  FRIENDLY: {
    pill: "bg-blue-100 text-blue-700",
    border: "border-l-blue-400",
    badge: "bg-blue-100 text-blue-700",
    label: "Match amical",
  },
  TOURNAMENT: {
    pill: "bg-amber-100 text-amber-800",
    border: "border-l-amber-400",
    badge: "bg-amber-100 text-amber-800",
    label: "Tournoi / Plateau",
  },
  OTHER: {
    pill: "bg-purple-100 text-purple-700",
    border: "border-l-purple-400",
    badge: "bg-purple-100 text-purple-700",
    label: "Événement club",
  },
  TRAINING: {
    pill: "bg-green-100 text-green-700",
    border: "border-l-green-400",
    badge: "bg-green-100 text-green-700",
    label: "Entraînement",
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
