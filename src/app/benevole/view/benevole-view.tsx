"use client";

import { useState } from "react";
import Image from "next/image";
import { Calendar, Check, HandHeart, MapPin, ScrollText, Undo2, X } from "lucide-react";
import { styleFor, formatEventTime } from "@/app/dashboard/event-style";
import RoleIcon from "@/app/dashboard/role-icon";
import {
  volunteerRoleIcon,
  volunteerRoleLabel,
  type VolunteerNeed,
} from "@/app/dashboard/event-volunteer-needs";
import { formatFirstName } from "@/lib/names";
import {
  SEGMENT_ABSENT_ON,
  SEGMENT_BUTTON,
  SEGMENT_GROUP,
  SEGMENT_OFF,
  SEGMENT_PRESENT_ON,
} from "@/app/dashboard/rsvp-segment";
import DocumentsPanel from "@/components/club-documents";
import EmptyState from "@/app/dashboard/empty-state";
import AdminSidebar, { type AdminSection } from "@/app/dashboard/admin-sidebar";
import { MobileNavProvider } from "@/app/dashboard/mobile-nav-context";
import MobileMenuButton from "@/app/dashboard/mobile-menu-button";
import type { ChildEvent } from "@/app/enfant/view/child-dashboard";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";
import { buildProfileSections, type ProfileMember, type ProfileTeam } from "./profile-sections";

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
  // Retour de Cindy du 06/09 ("le bénévole doit pouvoir se mettre présent
  // ou non") : sa réponse à cette invitation précise, distincte de
  // "Je m'en occupe" sur un besoin (BenevoleNeedRow ci-dessous) — voir
  // /api/benevole-rsvp.
  status: "PENDING" | "PRESENT" | "ABSENT";
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

// Retour de Cindy du 06/09 ("le bénévole doit pouvoir se mettre présent ou
// non") : réponse générale à CETTE invitation (distincte de "Je m'en
// occupe" sur un besoin précis, voir BenevoleNeedRow) — même habillage que
// RsvpButtons (calendar-view.tsx, joueurs), mais écrit via
// /api/benevole-rsvp plutôt qu'un appel Supabase direct (aucune session
// Supabase Auth côté bénévole).
function BenevoleRsvpButtons({ eventId, currentStatus }: { eventId: string; currentStatus: string }) {
  const [status, setStatus] = useState(currentStatus);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(newStatus: "PRESENT" | "ABSENT" | "PENDING") {
    const previousStatus = status;
    setStatus(newStatus);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/benevole-rsvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, status: newStatus }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus(previousStatus);
        setError(body?.error ?? "Réponse non enregistrée.");
      }
    } catch {
      setStatus(previousStatus);
      setError("Réponse non enregistrée.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={SEGMENT_GROUP}>
        <button
          disabled={pending}
          onClick={() => respond("PRESENT")}
          className={`${SEGMENT_BUTTON} ${status === "PRESENT" ? SEGMENT_PRESENT_ON : SEGMENT_OFF}`}
        >
          <Check className="h-3.5 w-3.5 shrink-0" />
          Présent
        </button>
        <button
          disabled={pending}
          onClick={() => respond("ABSENT")}
          className={`${SEGMENT_BUTTON} ${status === "ABSENT" ? SEGMENT_ABSENT_ON : SEGMENT_OFF}`}
        >
          <X className="h-3.5 w-3.5 shrink-0" />
          Absent
        </button>
        {/* Retour de Cindy du 06/09 ("on se doit de pouvoir revenir en
            arrière") : même geste que rsvp-control.tsx côté joueurs --
            revient à "en attente", ne s'affiche qu'une fois une réponse
            donnée. */}
        {status !== "PENDING" && (
          <button
            disabled={pending}
            onClick={() => respond("PENDING")}
            title="Revenir à « en attente »"
            className={`${SEGMENT_BUTTON} ${SEGMENT_OFF}`}
          >
            <Undo2 className="h-3.5 w-3.5 shrink-0" />
            Annuler
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
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
    // Retour de Cindy du 06/09 ("le liséré coloré comme sur les autres
    // espaces, même pour les bénévoles") : même bordure gauche que
    // calendar-view.tsx (border-l-4 + style.border, couleur par type
    // d'événement), jusqu'ici oubliée sur cette carte-ci.
    <div className={`rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm border-l-4 ${style.border}`}>
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
      {/* Retour de Cindy du 06/09 : réponse générale à l'événement, avant
          le détail des besoins d'organisation plus bas -- sans intitulé
          (retour de Cindy du 06/09), les boutons Présent/Absent parlent
          déjà d'eux-mêmes. */}
      <div className="mt-3 border-t border-zinc-100 pt-3">
        <BenevoleRsvpButtons eventId={event.id} currentStatus={event.status} />
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
  allowedBriques,
  profileTeams,
  profileMembers,
  profileEvents,
  profileSponsors,
  profileClubReports,
}: {
  firstName: string | null;
  benevoleId: string;
  events: BenevoleEvent[];
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
  // Retour de Cindy du 05/09 ("profil et bénévoles doivent être
  // fusionnés") : voir profile-sections.tsx. allowedBriques vide (cas
  // historique, aucun profil assigné) -> aucune entrée de menu en plus.
  allowedBriques: string[];
  profileTeams: ProfileTeam[];
  profileMembers: ProfileMember[];
  profileEvents: ChildEvent[];
  profileSponsors: SponsorDisplay[];
  profileClubReports: ClubReport[];
}) {
  // Retour de Cindy du 06/09 ("un menu comme les autres espaces... toutes
  // les vues de l'application doivent se ressembler") : même AdminSidebar
  // que Bureau/Coach/Famille (sidebar fixe sur PC, panneau + bouton
  // hamburger sur mobile via MobileNavProvider/MobileMenuButton) plutôt
  // qu'un simple empilement de blocs sur une seule page. "Mes événements"
  // (le cœur du rôle de bénévole) est toujours la première entrée ;
  // "Règlement intérieur" toujours la dernière ; entre les deux, une
  // entrée par brique cochée dans son profil d'accès (voir
  // profile-sections.tsx), s'il en a un.
  const sections: AdminSection[] = [
    {
      key: "invites",
      label: "Mes événements",
      icon: <HandHeart className="h-4 w-4 shrink-0" />,
      content: (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-zinc-500">
            Merci de ton aide ! Voici les événements où le Bureau et les coachs ont besoin de toi
            — clique sur un besoin pour te proposer.
          </p>
          {events.length === 0 ? (
            <EmptyState
              icon={Check}
              message="Aucun événement pour le moment. Le Bureau et les coachs te préviendront dès qu'ils auront besoin de toi."
            />
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
        </div>
      ),
    },
    ...buildProfileSections({
      allowedBriques,
      teams: profileTeams,
      members: profileMembers,
      events: profileEvents,
      sponsors: profileSponsors,
      clubReports: profileClubReports,
    }),
    {
      // Retour de Cindy du 25/08 : "penser en 360° avec les bénévoles, ils
      // font partie de la boucle" — mêmes règles de respect/fair-play que
      // sur le terrain les concernent aussi. Règlement Intérieur
      // uniquement (pas les deux chartes, propres aux licenciés/parents
      // d'un licencié).
      key: "reglement",
      label: "Règlement intérieur",
      icon: <ScrollText className="h-4 w-4 shrink-0" />,
      content: <DocumentsPanel documentIds={["reglement-interieur"]} />,
    },
  ];

  return (
    <MobileNavProvider>
      <div className="flex flex-1 flex-col overflow-x-hidden bg-zinc-50">
        <header className="bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-5 shadow-md sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Image src="/logo.png" alt="UBAC" width={44} height={44} className="h-11 w-11 object-contain" priority />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow">Bonjour</p>
                <h1 className="truncate text-xl font-bold text-white">
                  {formatFirstName(firstName) || "bénévole"}
                </h1>
              </div>
            </div>
            <MobileMenuButton />
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
          <AdminSidebar sections={sections} />
        </main>
      </div>
    </MobileNavProvider>
  );
}
