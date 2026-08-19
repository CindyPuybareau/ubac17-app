"use client";

import { useMemo, useState } from "react";
import { CalendarDays, MessageCircle, Trophy, Users } from "lucide-react";
import { sortTeamsByGroup } from "@/lib/teams";
import CalendarView, { type CalendarRsvpPlayer } from "./calendar-view";
import FamilyTeamCard, { type FamilyTeamCardData } from "./family-team-card";
import FamilyAttendanceRequests from "./family-attendance-requests";
import FamilyAttendanceSummary from "./family-attendance-summary";
import CalendarSubscribe from "./calendar-subscribe";
import FamilyCotisationCard from "./family-cotisation-card";
import ChildAccessManager from "./child-access-manager";
import NextConvocationCard from "./next-convocation-card";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import WhatsAppGroupsFamily from "./whatsapp-groups-family";
import type { AdminCotisation, AdminUpcomingEvent, WhatsAppGroup } from "./page";
import type { UpcomingEvent } from "./family-data";
import type { BirthdaySource } from "./birthdays";
import type { CarpoolOffer, EventRoleType, EventTasksState } from "./event-tasks";
import type { VolunteerNeed } from "./event-volunteer-needs";

const emptyEventTasks: EventTasksState = {};

type ConvocationCard = {
  player: { id: string; name: string; category: string | null; isSelf: boolean };
  event: UpcomingEvent;
  status: string;
};

// Navigation à 2 onglets, zéro redondance : "Planning & Matchs" concentre
// tout ce qui est chronologique (prochain rendez-vous en tête, puis tous
// les événements à venir avec la même carte interactive partout), "Mon
// Équipe" concentre tout ce qui est identitaire (qui coache, qui joue,
// où en est la cotisation). Plus aucune donnée n'apparaît sous deux formes
// différentes selon l'onglet où on se trouve.
export default function FamilyView({
  events,
  rsvpPlayers,
  rsvpStatusByKey,
  birthdayMembers,
  teamCards,
  convocationCards,
  rosterByEventId,
  tasksByEventId,
  carpoolByEventId,
  whatsappGroups,
  eventRoles,
  volunteerNeedsByEventId,
  cotisations,
}: {
  events: AdminUpcomingEvent[];
  rsvpPlayers: CalendarRsvpPlayer[];
  rsvpStatusByKey: Record<string, string>;
  birthdayMembers: BirthdaySource[];
  teamCards: FamilyTeamCardData[];
  convocationCards: ConvocationCard[];
  rosterByEventId: Record<string, { id: string; name: string }[]>;
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  whatsappGroups: WhatsAppGroup[];
  eventRoles: EventRoleType[];
  // Besoins en bénévoles (buvette, table de marque...) des événements club
  // ciblés/ouverts à tous — affichés en lecture "Je m'en occupe" seulement,
  // jamais en gestion (réservée au Bureau, voir admin-view.tsx).
  volunteerNeedsByEventId: Record<string, VolunteerNeed[]>;
  cotisations: AdminCotisation[];
}) {
  const iconClass = "h-4 w-4 shrink-0";

  // Sélecteur d'enfant : n'a de sens qu'à partir de deux. Avec un seul
  // enfant, une puce unique ne ferait qu'occuper de la place.
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const hasSeveralChildren = rsvpPlayers.length > 1;
  const visiblePlayers = useMemo(
    () =>
      selectedPlayerId ? rsvpPlayers.filter((p) => p.id === selectedPlayerId) : rsvpPlayers,
    [rsvpPlayers, selectedPlayerId]
  );

  // Un événement concerne la famille s'il vise l'équipe d'un des enfants
  // affichés, tout le club (teamId et targetTeamIds tous deux null), ou
  // réserve l'événement à quelques équipes dont une correspond à un enfant
  // affiché (targetTeamIds, voir 20261012000000) — sans ce dernier cas, un
  // enfant sélectionné seul dans une famille à plusieurs enfants pouvait
  // encore voir un événement réservé à l'équipe d'un AUTRE de ses frères et
  // sœurs, teamId étant null dans les deux cas (club entier ou ciblé).
  const visibleTeamIds = useMemo(
    () => new Set(visiblePlayers.flatMap((p) => p.teamIds)),
    [visiblePlayers]
  );
  const visibleEvents = useMemo(
    () =>
      events.filter((e) => {
        if (e.teamId) return visibleTeamIds.has(e.teamId);
        if (e.targetTeamIds) return e.targetTeamIds.some((id) => visibleTeamIds.has(id));
        return true;
      }),
    [events, visibleTeamIds]
  );
  const visibleTeamCards = useMemo(() => {
    const cards = selectedPlayerId
      ? teamCards.filter((c) => c.playerId === selectedPlayerId)
      : teamCards;
    // Même ordre que côté coach : l'équipe mère avant ses déclinaisons.
    return sortTeamsByGroup(cards.map((c) => ({ ...c, name: c.teamName })));
  }, [teamCards, selectedPlayerId]);

  // Sélecteur d'équipe de la vue Résultats (voir calendar-view.tsx) : une
  // famille à plusieurs enfants sur des équipes différentes a exactement
  // le même besoin qu'un coach sur "Mes Équipes" — dédoublonné par
  // équipe, un enfant sur 2 équipes ou 2 enfants sur la même n'y
  // apparaissant qu'une fois.
  const visibleResultsTeams = useMemo(() => {
    const byTeamId = new Map<string, { id: string; name: string | null; category: string | null }>();
    visibleTeamCards.forEach((c) => {
      if (!byTeamId.has(c.teamId)) {
        byTeamId.set(c.teamId, { id: c.teamId, name: c.teamName, category: c.category });
      }
    });
    return Array.from(byTeamId.values());
  }, [visibleTeamCards]);

  const visiblePlayerIds = useMemo(() => visiblePlayers.map((p) => p.id), [visiblePlayers]);
  const visibleCotisations = useMemo(
    () => cotisations.filter((c) => visiblePlayerIds.includes(c.playerId)),
    [cotisations, visiblePlayerIds]
  );
  const visibleConvocations = useMemo(
    () =>
      selectedPlayerId
        ? convocationCards.filter((c) => c.player.id === selectedPlayerId)
        : convocationCards,
    [convocationCards, selectedPlayerId]
  );

  // Un groupe "Équipe" ne concerne qu'une seule équipe : il ne s'affiche
  // que si cette équipe fait partie de l'enfant/des enfants actuellement
  // sélectionnés. Les groupes "Commission" (Buvette...) ne sont rattachés
  // à aucune équipe — ils restent visibles quel que soit l'enfant choisi,
  // sans quoi sélectionner un enfant en particulier ferait perdre l'accès
  // à un groupe où le parent est membre pour une tout autre raison.
  const visibleWhatsappGroups = useMemo(
    () =>
      whatsappGroups.filter(
        (g) => g.category === "COMMISSION" || (g.teamId !== null && visibleTeamIds.has(g.teamId))
      ),
    [whatsappGroups, visibleTeamIds]
  );

  // Même logique que les groupes WhatsApp ci-dessus : un anniversaire ne
  // reste affiché (puce du calendrier ET bloc "Anniversaires de la
  // semaine", tous deux dérivés de ce même tableau à l'intérieur de
  // CalendarView) que s'il appartient à une équipe de l'enfant/des enfants
  // actuellement sélectionnés — sinon, sélectionner Raphaël montrerait
  // quand même l'anniversaire d'une coéquipière de Léonie.
  const visibleBirthdayMembers = useMemo(
    () => birthdayMembers.filter((m) => m.teamIds?.some((id) => visibleTeamIds.has(id))),
    [birthdayMembers, visibleTeamIds]
  );

  const sections: AdminSection[] = [
    {
      key: "planning",
      label: "Planning & Matchs",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          {/* Le prochain rassemblement en tête : présences, itinéraire et
              rôles/covoiturage accessibles sans le moindre clic de plus. */}
          {visibleConvocations.map(({ player, event, status }) => (
            <NextConvocationCard
              key={player.id}
              playerName={player.isSelf ? "toi" : player.name}
              playerId={player.id}
              event={event}
              status={status}
              roster={rosterByEventId[event.id] ?? []}
              tasks={tasksByEventId[event.id] ?? emptyEventTasks}
              carpool={carpoolByEventId[event.id] ?? []}
              roles={eventRoles}
            />
          ))}

          {/* Tout le reste du calendrier : bascule liste/mois, même carte
              interactive (présences, itinéraire, rôles) sur chaque
              événement, qu'il s'agisse d'un match, d'un entraînement ou
              d'un stage. */}
          <CalendarView
            events={visibleEvents}
            rsvp={{ players: visiblePlayers, statusByKey: rsvpStatusByKey }}
            birthdayMembers={visibleBirthdayMembers}
            tasksByEventId={tasksByEventId}
            carpoolByEventId={carpoolByEventId}
            eventRoles={eventRoles}
            volunteerNeedsByEventId={volunteerNeedsByEventId}
          />
          <CalendarSubscribe />
          <ChildAccessManager />
        </div>
      ),
    },
    {
      key: "teams",
      label: "Mon Équipe",
      icon: <Users className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          {visibleTeamCards.map((c) => (
            <FamilyTeamCard key={`${c.playerId}-${c.teamId}`} card={c} />
          ))}
          {visibleTeamCards.length === 0 && (
            <p className="text-sm text-zinc-500">Aucune équipe rattachée pour le moment.</p>
          )}

          {/* Les groupes WhatsApp appartiennent à l'équipe : les chercher
              dans un onglet séparé revenait à quitter la page où on vient
              justement de lire qui sont les coachs. */}
          <div className="flex flex-col gap-2 border-t border-zinc-100 pt-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
              Discussions WhatsApp
            </p>
            <WhatsAppGroupsFamily groups={visibleWhatsappGroups} />
          </div>

          {/* Deux encarts discrets, en pied de page : la situation
              administrative n'a rien à faire mêlée au planning, mais
              reste à portée d'un scroll depuis l'écran "identité". */}
          <div className="grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-2">
            <FamilyCotisationCard cotisations={visibleCotisations} />
            <FamilyAttendanceSummary
              events={visibleEvents}
              players={visiblePlayers}
              rsvpStatusByKey={rsvpStatusByKey}
            />
          </div>
        </div>
      ),
    },
    {
      key: "results",
      label: "Résultats",
      icon: <Trophy className={iconClass} />,
      content: (
        <CalendarView
          events={visibleEvents}
          forcedView="results"
          resultsTeams={visibleResultsTeams.map((t) => ({ ...t, role: "PLAYER" as const }))}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* En tête de page et hors des onglets : une demande du coach doit
          se voir en ouvrant l'app, pas se découvrir en fouillant. */}
      <FamilyAttendanceRequests
        events={visibleEvents}
        players={visiblePlayers}
        statusByKey={rsvpStatusByKey}
      />

      {hasSeveralChildren && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Enfant
          </span>
          <button
            onClick={() => setSelectedPlayerId(null)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedPlayerId === null
                ? "border-navy bg-navy text-white"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            Tous
          </button>
          {rsvpPlayers.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedPlayerId(p.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedPlayerId === p.id
                  ? "border-navy bg-navy text-white"
                  : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <AdminSidebar sections={sections} />
    </div>
  );
}
