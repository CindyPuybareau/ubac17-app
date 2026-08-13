"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp, Trophy } from "lucide-react";
import { useScrollTopOnChange } from "@/lib/use-scroll-top-on-change";
import { formatPersonName } from "@/lib/names";
import CoachNextMatchCard from "./coach-next-match-card";
import { formatEventTime, styleFor } from "./calendar-view";
import { rolesForEventType } from "./event-tasks";
import SalleBadge from "./salle-badge";
import type { RosterPlayer, RsvpCounts, UpcomingEvent } from "./family-data";
import TaskSourceBadge from "./task-source-badge";
import RoleIcon from "./role-icon";
import EventRolesEditor from "./event-roles-editor";
import type {
  CarpoolOffer,
  EventTasksState,
  EventRoleType,
  SeasonTaskTally,
  TaskAssignment,
} from "./event-tasks";
import type { AdminUpcomingEvent } from "./page";

const emptyEventTasks: EventTasksState = {};

export type CoachTeamMatchCard = {
  team: { id: string; name: string | null; category: string | null };
  event: UpcomingEvent | null;
  counts: RsvpCounts | null;
  roster: RosterPlayer[];
};

type SubTab = "planning" | "bilan";
// "name" ou le code d un role du catalogue.
type SortKey = string;

function fullName(p: RosterPlayer) {
  return formatPersonName(p.first_name, p.last_name);
}

function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Un rôle non attribué doit se voir : c'est justement la ligne sur
// laquelle le coach doit agir.
function TaskCell({ assignment }: { assignment: TaskAssignment }) {
  if (!assignment) {
    return (
      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        À attribuer
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-sm text-zinc-700">{assignment.playerName}</span>
      <TaskSourceBadge source={assignment.source} />
    </span>
  );
}

function PlanningTab({
  cards,
  tasksByEventId,
  carpoolByEventId,
  upcomingEvents,
  rsvpStatusByKey,
  rsvpReasonByKey,
  roles,
}: {
  cards: CoachTeamMatchCard[];
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  upcomingEvents: AdminUpcomingEvent[];
  rsvpStatusByKey: Record<string, string>;
  rsvpReasonByKey: Record<string, string | null>;
  roles: EventRoleType[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <EventRolesEditor roles={roles} />

      {cards.map(({ team, event, counts, roster }) => (
        <CoachNextMatchCard
          key={team.id}
          teamName={`${team.name ?? "Équipe"}${
            team.category && team.category !== team.name ? ` · ${team.category}` : ""
          }`}
          event={event}
          counts={counts}
          roster={roster}
          tasks={event ? (tasksByEventId[event.id] ?? emptyEventTasks) : emptyEventTasks}
          carpool={event ? (carpoolByEventId[event.id] ?? []) : []}
          rsvpStatusByKey={rsvpStatusByKey}
          rsvpReasonByKey={rsvpReasonByKey}
          roles={roles}
        />
      ))}

      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <CalendarDays className="h-3.5 w-3.5 text-blue-700" />
          Prochains événements
        </p>
        <p className="mb-3 text-[11px] text-zinc-400">
          Qui lave les maillots, qui apporte le goûter — pour chaque date à venir.
        </p>

        {upcomingEvents.length === 0 ? (
          <p className="text-sm text-zinc-400">Aucun événement à venir.</p>
        ) : (
          <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
            <table className="w-full table-auto border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  <th className="whitespace-nowrap px-3 py-2.5">Date</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Heure</th>
                  <th className="whitespace-nowrap px-3 py-2.5">Type</th>
                  <th className="w-auto px-3 py-2.5">Équipe &amp; lieu</th>
                  {roles.map((role) => (
                    <th key={role.code} className="whitespace-nowrap px-3 py-2.5">
                      <span className="flex items-center gap-1">
                        <RoleIcon icon={role.icon} className="h-3.5 w-3.5 shrink-0" />
                        {role.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {upcomingEvents.map((e) => {
                  const style = styleFor(e.event_type);
                  const tasks = tasksByEventId[e.id] ?? emptyEventTasks;
                  // Un role restreint a certains types ne concerne pas cet
                  // evenement : afficher "A attribuer" y appellerait a une
                  // action impossible.
                  const applicable = new Set(
                    rolesForEventType(roles, e.event_type).map((r) => r.code)
                  );
                  return (
                    <tr key={e.id} className="border-b border-zinc-50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium text-zinc-900">
                        {formatDay(e.start_time)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-zinc-600">
                        {formatEventTime(e.start_time, e.end_time)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span
                          className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${style.badge}`}
                        >
                          {style.label}
                        </span>
                      </td>
                      <td className="w-auto px-3 py-2.5 text-zinc-600">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-zinc-800">{e.teamName}</span>
                          {e.salle ? (
                            <SalleBadge salle={e.salle} />
                          ) : e.location ? (
                            <span className="truncate text-xs text-zinc-500">{e.location}</span>
                          ) : null}
                        </span>
                      </td>
                      {roles.map((role) => (
                        <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                          {applicable.has(role.code) ? (
                            <TaskCell assignment={tasks[role.code] ?? null} />
                          ) : (
                            <span className="text-zinc-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function BilanTeamTable({
  team,
  roster,
  tally,
  roles,
}: {
  team: CoachTeamMatchCard["team"];
  roster: RosterPlayer[];
  tally: SeasonTaskTally;
  roles: EventRoleType[];
}) {
  // Par défaut : les familles qui ont le moins contribué en premier, ce
  // qui est la question que se pose un coach en ouvrant ce bilan.
  const [sortKey, setSortKey] = useState<SortKey>(roles[0]?.code ?? "name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(key);
    setSortDir(key === "name" ? "asc" : "asc");
  }

  const rows = useMemo(() => {
    const list = roster.map((p) => ({
      id: p.id,
      name: fullName(p),
      counts: tally[p.id] ?? {},
    }));
    const dir = sortDir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "fr") * dir;
      const diff = ((a.counts[sortKey] ?? 0) - (b.counts[sortKey] ?? 0)) * dir;
      return diff !== 0 ? diff : a.name.localeCompare(b.name, "fr");
    });
  }, [roster, tally, sortKey, sortDir]);

  // Un total par rôle du catalogue, y compris les rôles créés par le club.
  const totals = roles.map((role) => ({
    role,
    total: rows.reduce((sum, r) => sum + (r.counts[role.code] ?? 0), 0),
  }));

  // La key vit ici : les colonnes de rôle sont produites par un .map, et
  // sans elle React réutilise mal les <th> quand le catalogue change.
  const header = (key: SortKey, label: string, icon?: React.ReactNode) => (
    <th key={key} className="whitespace-nowrap px-3 py-2.5">
      <button
        onClick={() => toggleSort(key)}
        className="flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-navy"
      >
        {icon}
        {label}
        {sortKey === key &&
          (sortDir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
          ))}
      </button>
    </th>
  );

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <Trophy className="h-4 w-4 shrink-0 text-ubac-yellow-dark" />
          {team.name ?? "Équipe"}
          {team.category && team.category !== team.name && (
            <span className="text-xs font-medium text-zinc-400">· {team.category}</span>
          )}
        </p>
        <p className="text-xs text-zinc-500">
          {totals.map((t) => `${t.total} ${t.role.label.toLowerCase()}`).join(" · ")}
          {totals.length > 0 ? " sur la saison" : ""}
        </p>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold text-zinc-400">
              {header("name", "Famille / Joueur")}
              {roles.map((role) =>
                header(role.code, role.label, <RoleIcon icon={role.icon} className="h-3.5 w-3.5 shrink-0" />)
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-zinc-50 last:border-0">
                <td className="w-auto px-3 py-2.5 font-semibold text-zinc-800">{r.name}</td>
                {roles.map((role) => {
                  const count = r.counts[role.code] ?? 0;
                  return (
                    <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                      <span
                        className={`font-semibold ${count === 0 ? "text-zinc-300" : "text-zinc-900"}`}
                      >
                        {count}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={roles.length + 1}
                  className="px-3 py-4 text-center text-sm text-zinc-400"
                >
                  Aucun joueur dans cette équipe
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CoachOrganisation({
  cards,
  tasksByEventId,
  carpoolByEventId,
  events,
  taskTallyByTeamId,
  rsvpStatusByKey,
  rsvpReasonByKey,
  roles,
}: {
  cards: CoachTeamMatchCard[];
  tasksByEventId: Record<string, EventTasksState>;
  carpoolByEventId: Record<string, CarpoolOffer[]>;
  events: AdminUpcomingEvent[];
  taskTallyByTeamId: Record<string, SeasonTaskTally>;
  rsvpStatusByKey: Record<string, string>;
  rsvpReasonByKey: Record<string, string | null>;
  roles: EventRoleType[];
}) {
  const [tab, setTab] = useState<SubTab>("planning");
  useScrollTopOnChange(tab);

  // Filtré côté client : Date.now() dans un composant serveur rendrait le
  // rendu impur, et la liste reste juste après un router.refresh().
  const upcomingEvents = useMemo(() => {
    const nowMs = Date.now();
    return events
      .filter((e) => new Date(e.start_time).getTime() >= nowMs)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [events]);

  if (cards.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Aucune équipe ne t&apos;est rattachée pour le moment.
      </p>
    );
  }

  const tabButtonClass = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
      active ? "bg-navy text-white" : "text-navy hover:bg-blue-50"
    }`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTab("planning")} className={tabButtonClass(tab === "planning")}>
          <CalendarDays className="h-3.5 w-3.5" />
          Planning &amp; Rôles
        </button>
        <button onClick={() => setTab("bilan")} className={tabButtonClass(tab === "bilan")}>
          <Trophy className="h-3.5 w-3.5" />
          Bilan de la saison
        </button>
      </div>

      {tab === "planning" ? (
        <PlanningTab
          cards={cards}
          tasksByEventId={tasksByEventId}
          carpoolByEventId={carpoolByEventId}
          upcomingEvents={upcomingEvents}
          rsvpStatusByKey={rsvpStatusByKey}
          rsvpReasonByKey={rsvpReasonByKey}
          roles={roles}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-zinc-500">
            Cumul des rôles depuis le début de la saison. Cliquez sur une colonne pour
            trier — par défaut, les familles qui ont le moins contribué apparaissent en
            premier.
          </p>
          {cards.map(({ team, roster }) => (
            <BilanTeamTable
              key={team.id}
              team={team}
              roster={roster}
              tally={taskTallyByTeamId[team.id] ?? {}}
              roles={roles}
            />
          ))}
        </div>
      )}
    </div>
  );
}
