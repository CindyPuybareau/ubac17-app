import CoachNextMatchCard from "./coach-next-match-card";
import type { RosterPlayer, RsvpCounts, UpcomingEvent } from "./family-data";
import type { CarpoolOffer, EventTasksState } from "./event-tasks";

const emptyEventTasks: EventTasksState = { JERSEYS: null, SNACKS: null };

export type CoachTeamMatchCard = {
  team: { id: string; name: string | null; category: string | null };
  event: UpcomingEvent | null;
  counts: RsvpCounts | null;
  roster: RosterPlayer[];
};

export default function CoachOrganisation({
  cards,
  tasksByEventId,
  carpoolByEventId,
}: {
  cards: CoachTeamMatchCard[];
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
}) {
  if (cards.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Aucune équipe ne t&apos;est rattachée pour le moment.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {cards.map(({ team, event, counts, roster }) => (
        <CoachNextMatchCard
          key={team.id}
          teamName={`${team.name ?? "Équipe"}${team.category ? ` · ${team.category}` : ""}`}
          event={event}
          counts={counts}
          roster={roster}
          tasks={event ? (tasksByEventId[event.id] ?? emptyEventTasks) : emptyEventTasks}
          carpool={event ? (carpoolByEventId[event.id] ?? []) : []}
        />
      ))}
    </div>
  );
}
