"use client";

import { useState } from "react";
import Image from "next/image";
import { Calendar, Check, MapPin, X } from "lucide-react";
import { styleFor, formatEventTime } from "@/app/dashboard/event-style";
import RoleIcon from "@/app/dashboard/role-icon";
import {
  volunteerRoleIcon,
  volunteerRoleLabel,
  type VolunteerNeed,
} from "@/app/dashboard/event-volunteer-needs";
import { formatFirstName } from "@/lib/names";

// Événement tel que vu par un bénévole : uniquement date/heure/lieu et les
// besoins d'organisation (retour de Cindy du 2026-08-25, "pour le reste
// score... pas d'intérêt pour lui") — jamais de RSVP joueurs, de score, ni
// aucune autre donnée de l'événement.
export type BenevoleEvent = {
  id: string;
  title: string | null;
  eventType: string | null;
  location: string | null;
  salle: string | null;
  startTime: string;
  endTime: string | null;
  teamName: string | null;
};

function remainingSlots(need: VolunteerNeed) {
  return Math.max(0, need.requiredCount - need.signups.length);
}

// Un seul bouton (rejoindre/quitter), pas de gestion des besoins eux-mêmes
// (ajout/suppression/effectif requis) — un bénévole ne fait jamais que se
// proposer, jamais gérer. Écrit via /api/benevole-signup, jamais un appel
// Supabase direct (aucune session Supabase Auth côté bénévole).
function BenevoleNeedRow({
  need,
  benevoleId,
}: {
  need: VolunteerNeed;
  benevoleId: string;
}) {
  const [localNeed, setLocalNeed] = useState(need);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = volunteerRoleLabel(localNeed.roleCode, localNeed.customLabel);
  const icon = volunteerRoleIcon(localNeed.roleCode);
  const remaining = remainingSlots(localNeed);
  const mySignup = localNeed.signups.find((s) => s.benevoleId === benevoleId);

  async function act(action: "join" | "leave") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/benevole-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ needId: localNeed.id, action }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? "Une erreur est survenue.");
        return;
      }
      setLocalNeed((prev) => ({
        ...prev,
        signups:
          action === "join"
            ? [
                ...prev.signups,
                { id: `local-${Date.now()}`, playerId: null, benevoleId, playerName: "", source: "VOLUNTEER" },
              ]
            : prev.signups.filter((s) => s.benevoleId !== benevoleId),
      }));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RoleIcon icon={icon} />
          <p className="text-xs font-medium text-zinc-700">{label}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            remaining > 0 ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {remaining > 0
            ? `${localNeed.signups.length}/${localNeed.requiredCount}`
            : `Complet (${localNeed.signups.length}/${localNeed.requiredCount})`}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {mySignup ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => act("leave")}
          className="flex w-fit shrink-0 items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
        >
          <X className="h-3 w-3" />
          Annuler
        </button>
      ) : remaining > 0 ? (
        <button
          type="button"
          disabled={pending}
          onClick={() => act("join")}
          className="w-fit shrink-0 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60"
        >
          {pending ? "..." : "Je m'en occupe"}
        </button>
      ) : null}
    </div>
  );
}

function EventCard({
  event,
  needs,
  benevoleId,
}: {
  event: BenevoleEvent;
  needs: VolunteerNeed[];
  benevoleId: string;
}) {
  const style = styleFor(event.eventType);
  const lieu = event.salle || event.location;

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style.badge}`}>
          {style.label}
        </span>
        {event.teamName && <span className="text-xs font-semibold text-zinc-500">{event.teamName}</span>}
      </div>
      <p className="mt-1 font-semibold text-zinc-900">{event.title ?? style.label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3 shrink-0" />
          {new Date(event.startTime).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          , {formatEventTime(event.startTime, event.endTime)}
        </span>
        {lieu && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3 shrink-0" />
            {lieu}
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Besoins d&apos;organisation
        </p>
        {needs.length === 0 ? (
          <p className="text-xs text-zinc-400">Aucun besoin pour le moment.</p>
        ) : (
          needs.map((need) => (
            <BenevoleNeedRow key={need.id} need={need} benevoleId={benevoleId} />
          ))
        )}
      </div>
    </div>
  );
}

export default function BenevoleView({
  firstName,
  benevoleId,
  events,
  volunteerNeedsByEventId,
}: {
  firstName: string | null;
  benevoleId: string;
  events: BenevoleEvent[];
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-x-hidden bg-zinc-50">
      <header className="bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-5 shadow-md sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <Image src="/logo.png" alt="UBAC" width={44} height={44} className="h-11 w-11 object-contain" priority />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow">Bonjour</p>
            <h1 className="truncate text-xl font-bold text-white">
              {formatFirstName(firstName) || "bénévole"}
            </h1>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        <p className="text-sm text-zinc-500">
          Merci de ton aide ! Voici les événements où le Bureau a besoin de toi — clique sur un
          besoin pour te proposer.
        </p>
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-8 text-center shadow-sm">
            <Check className="h-8 w-8 text-emerald-400" />
            <p className="text-sm text-zinc-500">
              Aucun événement pour le moment. Le Bureau te préviendra dès qu&apos;il aura besoin de
              toi.
            </p>
          </div>
        ) : (
          events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              needs={volunteerNeedsByEventId[event.id] ?? []}
              benevoleId={benevoleId}
            />
          ))
        )}
      </main>
    </div>
  );
}
