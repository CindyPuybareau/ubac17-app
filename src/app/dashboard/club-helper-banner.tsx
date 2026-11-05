"use client";

import { useState } from "react";
import { HeartHandshake } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { volunteerAsGuest } from "./event-volunteer-needs";
import { formatEventTime, styleFor } from "./event-style";
import SalleBadge from "./salle-badge";

// Retour du Bureau du 04/11 ("U9 Mixte, un seul coach pour 25+ enfants") :
// un entraînement explicitement ouvert (open_to_club_helpers, voir
// create-event-form.tsx) devient visible ici par TOUT compte connecté, même
// sans enfant dans l'équipe concernée -- seule la carte complète (présences,
// liste des enfants) reste, elle, réservée à l'équipe. page.tsx calcule déjà
// requiredCount/signupNames (via getVolunteerNeedsByEventId) et filtre un
// entraînement déjà complet AVANT de le passer ici : un entraînement à 3/3
// disparaît simplement de la liste, jamais affiché "complet".
export type ClubHelperEvent = {
  eventId: string;
  needId: string;
  teamName: string;
  startTime: string;
  // Retour de Cindy du 05/11 ("dire que c'est un entraînement est
  // important, et la date de fin aussi") : cette fonctionnalité ne
  // s'applique aujourd'hui qu'aux entraînements (case réservée à ce type,
  // create-event-form.tsx), mais le badge est quand même calculé via
  // styleFor comme partout ailleurs plutôt que codé en dur "Entraînement".
  eventType: string | null;
  endTime: string | null;
  salle: string | null;
  location: string | null;
  signupNames: string[];
};

function ClubHelperCard({ event }: { event: ClubHelperEvent }) {
  const [names, setNames] = useState(event.signupNames);
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = fullName.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const { error: writeError } = await volunteerAsGuest(supabase, event.needId, trimmed);
    setSubmitting(false);
    if (writeError) {
      setError(writeError);
      return;
    }
    // Affichage optimiste (même principe que RsvpButtons) -- le temps réel
    // (realtime-sync.tsx, event_volunteer_signups) corrige silencieusement
    // si besoin au prochain rafraîchissement chez ce même compte.
    setNames((prev) => [...prev, trimmed]);
    setFullName("");
  }

  const style = styleFor(event.eventType);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${style.badge}`}>
          {style.label}
        </span>
        <span className="text-sm font-semibold text-zinc-900">{event.teamName}</span>
        <span className="text-sm text-zinc-600">
          {new Date(event.startTime).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          , {formatEventTime(event.startTime, event.endTime)}
        </span>
        {event.salle ? (
          <SalleBadge salle={event.salle} />
        ) : (
          event.location && <span className="text-sm text-zinc-600">{event.location}</span>
        )}
      </div>

      {names.length > 0 && (
        <p className="text-xs text-zinc-600">
          Déjà proposé{names.length > 1 ? "s" : ""} : {names.join(", ")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Retour de Cindy du 05/11 ("attention au responsive sur tel") :
            placeholder raccourci + texte réduit (text-xs) des deux côtés --
            "Ton prénom et nom" se tronquait mal sous ~340px de large. Ligne
            unique volontairement conservée (jamais agrandir la carte). */}
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Prénom Nom"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs"
        />
        <button
          type="button"
          disabled={submitting || !fullName.trim()}
          onClick={submit}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
        >
          Je me propose
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">Inscription non enregistrée : {error}</p>}
    </div>
  );
}

export default function ClubHelperBanner({ events }: { events: ClubHelperEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-400/50 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-bold text-navy">
        <HeartHandshake className="h-4 w-4 shrink-0 text-amber-700" />
        Besoin accompagnant
      </p>
      {events.map((event) => (
        <ClubHelperCard key={event.eventId} event={event} />
      ))}
    </div>
  );
}
