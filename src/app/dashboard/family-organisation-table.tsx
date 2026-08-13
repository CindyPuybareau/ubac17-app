"use client";

import { CalendarDays } from "lucide-react";
import { formatEventTime, styleFor } from "./calendar-view";
import RoleIcon from "./role-icon";
import SalleBadge from "./salle-badge";
import TaskSourceBadge from "./task-source-badge";
import { rolesForEventType } from "./event-tasks";
import type { EventRoleType, EventTasksState } from "./event-tasks";
import type { AdminUpcomingEvent } from "./page";

const emptyTasks: EventTasksState = {};

function upcomingSorted(events: AdminUpcomingEvent[]) {
  const now = Date.now();
  return events
    .filter((e) => new Date(e.start_time).getTime() >= now)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
}

// Vue d'ensemble en lecture : qui s'occupe de quoi sur les prochaines
// dates. Se proposer pour un rôle reste le rôle du bloc juste en dessous —
// ici on répond à "est-ce que quelqu'un s'en charge déjà ?".
export default function FamilyOrganisationTable({
  events,
  tasksByEventId,
  roles,
  myPlayerIds,
}: {
  events: AdminUpcomingEvent[];
  tasksByEventId: Record<string, EventTasksState>;
  roles: EventRoleType[];
  // Pour mettre en évidence ce que la famille a déjà pris en charge.
  myPlayerIds: string[];
}) {
  const upcoming = upcomingSorted(events).filter(
    (e) => rolesForEventType(roles, e.event_type).length > 0
  );

  if (roles.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Aucun rôle d&apos;organisation défini par le club pour l&apos;instant.
      </p>
    );
  }

  if (upcoming.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Aucun rassemblement à organiser dans les prochaines dates.
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <CalendarDays className="h-3.5 w-3.5 text-blue-700" />
        Qui s&apos;occupe de quoi
      </p>
      <p className="mb-3 text-[11px] text-zinc-400">
        Récapitulatif des rôles attribués sur les prochains rassemblements.
      </p>

      <div className="w-full overflow-x-auto rounded-xl border border-zinc-100">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="whitespace-nowrap px-3 py-2.5">Date</th>
              <th className="w-auto px-3 py-2.5">Rassemblement</th>
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
            {upcoming.map((e) => {
              const style = styleFor(e.event_type);
              const tasks = tasksByEventId[e.id] ?? emptyTasks;
              // Un rôle restreint à d'autres types ne concerne pas cette
              // date : y afficher "À attribuer" appellerait à une action
              // impossible.
              const applicable = new Set(
                rolesForEventType(roles, e.event_type).map((r) => r.code)
              );

              return (
                <tr key={e.id} className="border-b border-zinc-50 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className="block font-medium text-zinc-900">
                      {new Date(e.start_time).toLocaleDateString("fr-FR", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                    <span className="block text-xs text-zinc-500">
                      {formatEventTime(e.start_time, e.end_time)}
                    </span>
                  </td>
                  <td className="w-auto px-3 py-2.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${style.badge}`}
                      >
                        {style.label}
                      </span>
                      <span className="font-medium text-zinc-800">{e.teamName}</span>
                      {e.salle && <SalleBadge salle={e.salle} />}
                    </span>
                  </td>
                  {roles.map((role) => {
                    if (!applicable.has(role.code)) {
                      return (
                        <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                          <span className="text-zinc-300">—</span>
                        </td>
                      );
                    }
                    const assignment = tasks[role.code] ?? null;
                    if (!assignment) {
                      return (
                        <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                          <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                            À attribuer
                          </span>
                        </td>
                      );
                    }
                    const isMine = myPlayerIds.includes(assignment.playerId);
                    return (
                      <td key={role.code} className="whitespace-nowrap px-3 py-2.5">
                        <span className="flex items-center gap-1.5">
                          <span
                            className={
                              isMine ? "text-sm font-semibold text-navy" : "text-sm text-zinc-700"
                            }
                          >
                            {isMine ? "Vous" : assignment.playerName}
                          </span>
                          <TaskSourceBadge source={assignment.source} />
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
