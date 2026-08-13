"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ClipboardList, MessageCircle, Users } from "lucide-react";
import { sortTeamsByGroup } from "@/lib/teams";
import CalendarView, { type CalendarRsvpPlayer } from "./calendar-view";
import FamilyTeamCard, { type FamilyTeamCardData } from "./family-team-card";
import FamilyEventFeed from "./family-event-feed";
import FamilyOrganisationTable from "./family-organisation-table";
import FamilyUpcomingRoles from "./family-upcoming-roles";
import NextConvocationCard from "./next-convocation-card";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import WhatsAppGroupsFamily from "./whatsapp-groups-family";
import type { AdminUpcomingEvent, WhatsAppGroup } from "./page";
import type { UpcomingEvent } from "./family-data";
import type { BirthdaySource } from "./birthdays";
import type { CarpoolOffer, EventRoleType, EventTasksState } from "./event-tasks";

const emptyEventTasks: EventTasksState = {};

type ConvocationCard = {
  player: { id: string; name: string; category: string | null; isSelf: boolean };
  event: UpcomingEvent;
  status: string;
};

export default function FamilyView({
  events,
  rsvpPlayers,
  rsvpStatusByKey,
  rsvpReasonByKey,
  birthdayMembers,
  teamCards,
  convocationCards,
  rosterByEventId,
  tasksByEventId,
  carpoolByEventId,
  whatsappGroups,
  eventRoles,
}: {
  events: AdminUpcomingEvent[];
  rsvpPlayers: CalendarRsvpPlayer[];
  rsvpStatusByKey: Record<string, string>;
  rsvpReasonByKey: Record<string, string | null>;
  birthdayMembers: BirthdaySource[];
  teamCards: FamilyTeamCardData[];
  convocationCards: ConvocationCard[];
  rosterByEventId: Record<string, { id: string; name: string }[]>;
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  whatsappGroups: WhatsAppGroup[];
  eventRoles: EventRoleType[];
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
  // affichés, ou tout le club (teamId null).
  const visibleTeamIds = useMemo(
    () => new Set(visiblePlayers.flatMap((p) => p.teamIds)),
    [visiblePlayers]
  );
  const visibleEvents = useMemo(
    () => events.filter((e) => !e.teamId || visibleTeamIds.has(e.teamId)),
    [events, visibleTeamIds]
  );
  const visibleTeamCards = useMemo(() => {
    const cards = selectedPlayerId
      ? teamCards.filter((c) => c.playerId === selectedPlayerId)
      : teamCards;
    // Même ordre que côté coach : l'équipe mère avant ses déclinaisons.
    return sortTeamsByGroup(cards.map((c) => ({ ...c, name: c.teamName })));
  }, [teamCards, selectedPlayerId]);

  const visiblePlayerIds = useMemo(() => visiblePlayers.map((p) => p.id), [visiblePlayers]);
  const visibleConvocations = useMemo(
    () =>
      selectedPlayerId
        ? convocationCards.filter((c) => c.player.id === selectedPlayerId)
        : convocationCards,
    [convocationCards, selectedPlayerId]
  );

  const sections: AdminSection[] = [
    {
      key: "calendar",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <CalendarView
          events={visibleEvents}
          rsvp={{ players: visiblePlayers, statusByKey: rsvpStatusByKey }}
          birthdayMembers={birthdayMembers}
        />
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
            <WhatsAppGroupsFamily groups={whatsappGroups} />
          </div>
        </div>
      ),
    },
    {
      key: "events",
      label: "Prochains Événements",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <FamilyEventFeed
          events={visibleEvents}
          players={visiblePlayers}
          rsvpStatusByKey={rsvpStatusByKey}
          rsvpReasonByKey={rsvpReasonByKey}
        />
      ),
    },
    {
      key: "organisation",
      label: "Organisation",
      icon: <ClipboardList className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          <FamilyOrganisationTable
            events={visibleEvents}
            tasksByEventId={tasksByEventId}
            roles={eventRoles}
            myPlayerIds={visiblePlayerIds}
          />
          {/* Le prochain rassemblement garde sa carte détaillée : c'est
              d'elle que dépend le covoiturage (proposer des places), que ni
              le récapitulatif ni la liste des rôles ne couvrent. */}
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
          <FamilyUpcomingRoles
            events={visibleEvents}
            players={visiblePlayers}
            tasksByEventId={tasksByEventId}
            roles={eventRoles}
          />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
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
