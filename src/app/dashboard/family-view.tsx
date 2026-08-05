import { CalendarDays, ClipboardList, Dumbbell, MessageCircle, Users } from "lucide-react";
import CalendarView, { type CalendarRsvpPlayer } from "./calendar-view";
import FamilyTeamCard, { type FamilyTeamCardData } from "./family-team-card";
import FamilyTrainings from "./family-trainings";
import NextConvocationCard from "./next-convocation-card";
import AdminSidebar, { type AdminSection } from "./admin-sidebar";
import WhatsAppGroupsFamily from "./whatsapp-groups-family";
import type { AdminUpcomingEvent, WhatsAppGroup } from "./page";
import type { UpcomingEvent } from "./family-data";
import type { BirthdaySource } from "./birthdays";
import type { CarpoolOffer, EventTasksState } from "./event-tasks";

const emptyEventTasks: EventTasksState = { JERSEYS: null, SNACKS: null };

type ConvocationCard = {
  player: { id: string; name: string; category: string | null; isSelf: boolean };
  event: UpcomingEvent;
  status: string;
};

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
}) {
  const iconClass = "h-4 w-4 shrink-0";
  const sections: AdminSection[] = [
    {
      key: "calendar",
      label: "Calendrier",
      icon: <CalendarDays className={iconClass} />,
      content: (
        <CalendarView
          events={events}
          rsvp={{ players: rsvpPlayers, statusByKey: rsvpStatusByKey }}
          birthdayMembers={birthdayMembers}
        />
      ),
    },
    {
      key: "teams",
      label: "Équipes",
      icon: <Users className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          {teamCards.map((c) => (
            <FamilyTeamCard key={`${c.playerId}-${c.teamId}`} card={c} />
          ))}
          {teamCards.length === 0 && (
            <p className="text-sm text-zinc-500">
              Aucune équipe rattachée pour le moment.
            </p>
          )}
        </div>
      ),
    },
    {
      key: "trainings",
      label: "Entraînements",
      icon: <Dumbbell className={iconClass} />,
      content: <FamilyTrainings events={events} rsvpPlayers={rsvpPlayers} />,
    },
    {
      key: "organisation",
      label: "Organisation",
      icon: <ClipboardList className={iconClass} />,
      content: (
        <div className="flex flex-col gap-4">
          {convocationCards.map(({ player, event, status }) => (
            <NextConvocationCard
              key={player.id}
              playerName={player.isSelf ? "toi" : player.name}
              playerId={player.id}
              event={event}
              status={status}
              roster={rosterByEventId[event.id] ?? []}
              tasks={tasksByEventId[event.id] ?? emptyEventTasks}
              carpool={carpoolByEventId[event.id] ?? []}
            />
          ))}
          {convocationCards.length === 0 && (
            <p className="text-sm text-zinc-500">
              Aucun prochain match programmé.
            </p>
          )}
        </div>
      ),
    },
    {
      key: "whatsapp",
      label: "WhatsApp",
      icon: <MessageCircle className={iconClass} />,
      content: <WhatsAppGroupsFamily groups={whatsappGroups} />,
    },
  ];

  return <AdminSidebar sections={sections} />;
}
