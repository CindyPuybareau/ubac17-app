"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatEventTime, styleFor } from "./calendar-view";
import SalleBadge from "./salle-badge";
import TaskSourceBadge from "./task-source-badge";
import { rolesForEventType } from "./event-tasks";
import RoleIcon from "./role-icon";
import type { EventRoleType, EventTasksState, TaskType } from "./event-tasks";
import type { AdminUpcomingEvent } from "./page";

const emptyTasks: EventTasksState = {};


function formatDay(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// Se proposer pour un rôle sur N'IMPORTE QUEL événement à venir, et plus
// seulement sur le prochain match affiché par NextConvocationCard. La RLS
// autorise déjà un parent à créer une tâche pour son propre enfant sur un
// événement de l'équipe de cet enfant (voir 20260804000000_match_tasks).
export default function FamilyUpcomingRoles({
  events,
  players,
  tasksByEventId,
  roles,
}: {
  events: AdminUpcomingEvent[];
  players: { id: string; name: string; teamIds: string[] }[];
  tasksByEventId: Record<string, EventTasksState>;
  roles: EventRoleType[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upcoming = useMemo(() => {
    const nowMs = Date.now();
    return events
      .filter((e) => new Date(e.start_time).getTime() >= nowMs)
      // Un entraînement n'a plus aucun rôle applicable : l'afficher
      // laisserait une carte de date sans rien à quoi se proposer.
      .filter((e) => rolesForEventType(roles, e.event_type).length > 0)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [events, roles]);

  // L'enfant concerné par cet événement : celui dont l'équipe correspond.
  // Un événement club (teamId null) concerne le premier enfant.
  function playerFor(event: AdminUpcomingEvent) {
    if (!event.teamId) return players[0] ?? null;
    return players.find((p) => p.teamIds.includes(event.teamId!)) ?? null;
  }

  async function volunteer(eventId: string, taskType: TaskType, playerId: string) {
    const key = `${eventId}-${taskType}`;
    setPending(key);
    setError(null);
    const supabase = createClient();
    const { error: insertError } = await supabase
      .from("event_tasks")
      .insert({
        event_id: eventId,
        task_type: taskType,
        player_id: playerId,
        source: "VOLUNTEER",
      });
    setPending(null);
    if (insertError) {
      // Contrainte unique (event_id, task_type) : quelqu'un vient de le
      // prendre. Ce n'est pas un bug, c'est la course qui se résout.
      setError(
        insertError.code === "23505"
          ? "Ce rôle vient d'être pris par une autre famille."
          : insertError.message
      );
    }
    router.refresh();
  }

  async function withdraw(eventId: string, taskType: TaskType) {
    const key = `${eventId}-${taskType}`;
    setPending(key);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("event_tasks")
      .delete()
      .eq("event_id", eventId)
      .eq("task_type", taskType);
    setPending(null);
    if (deleteError) setError(deleteError.message);
    router.refresh();
  }

  if (upcoming.length === 0) return null;

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <CalendarDays className="h-3.5 w-3.5 text-blue-700" />
        Se proposer sur les prochains événements
      </p>
      <p className="mb-3 text-[11px] text-zinc-400">
        Vous pouvez prendre un rôle dès maintenant, sans attendre la veille du match.
      </p>

      {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        {upcoming.map((e) => {
          const child = playerFor(e);
          if (!child) return null;
          const tasks = tasksByEventId[e.id] ?? emptyTasks;
          const style = styleFor(e.event_type);

          return (
            <div key={e.id} className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${style.badge}`}
                >
                  {style.label}
                </span>
                <span className="text-sm font-medium text-zinc-800">
                  {formatDay(e.start_time)} · {formatEventTime(e.start_time, e.end_time)}
                </span>
                {e.salle ? (
                  <SalleBadge salle={e.salle} />
                ) : e.location ? (
                  <span className="truncate text-xs text-zinc-500">{e.location}</span>
                ) : null}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                {rolesForEventType(roles, e.event_type).map((role) => {
                  const taskType = role.code;
                  const assignment = tasks[taskType] ?? null;
                  const isMine = assignment?.playerId === child.id;
                  const key = `${e.id}-${taskType}`;

                  return (
                    <div
                      key={taskType}
                      // Pas de justify-between : le bouton suit immédiatement
                      // le texte au lieu d'être renvoyé au bord droit, ce qui
                      // creusait un fossé visuel sur les cartes larges.
                      className="flex flex-1 items-center gap-3 rounded-lg bg-white px-3 py-2"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <RoleIcon icon={role.icon} className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-zinc-700">
                            {role.label}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                            <span className="truncate">
                              {assignment ? assignment.playerName : "Non attribué"}
                            </span>
                            {assignment && <TaskSourceBadge source={assignment.source} />}
                          </span>
                        </span>
                      </span>

                      {!assignment ? (
                        <button
                          type="button"
                          disabled={pending === key}
                          onClick={() => volunteer(e.id, taskType, child.id)}
                          className="shrink-0 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy/90 disabled:opacity-60"
                        >
                          Je m&apos;en occupe
                        </button>
                      ) : isMine ? (
                        <button
                          type="button"
                          disabled={pending === key}
                          onClick={() => withdraw(e.id, taskType)}
                          className="flex shrink-0 items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-60"
                        >
                          <X className="h-3 w-3" />
                          Annuler
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
