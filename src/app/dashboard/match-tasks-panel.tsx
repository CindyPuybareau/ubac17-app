"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import TaskSourceBadge from "./task-source-badge";
import RoleIcon from "./role-icon";
import type {
  CarpoolOffer,
  EventRoleType,
  EventTasksState,
  TaskType,
} from "./event-tasks";


export default function MatchTasksPanel({
  eventId,
  roster,
  myPlayerIds,
  canAssignAnyone,
  initialTasks,
  initialCarpool,
  roles,
}: {
  eventId: string;
  roster: { id: string; name: string }[];
  myPlayerIds: string[];
  canAssignAnyone: boolean;
  initialTasks: EventTasksState;
  initialCarpool: CarpoolOffer[];
  // Catalogue applicable a ce type d evenement, resolu par l appelant.
  roles: EventRoleType[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<TaskType | "carpool" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function volunteer(taskType: TaskType, playerId: string) {
    setPending(taskType);
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
      setError("Déjà attribué à quelqu'un d'autre.");
    }
    router.refresh();
  }

  async function withdraw(taskType: TaskType) {
    setPending(taskType);
    const supabase = createClient();
    await supabase
      .from("event_tasks")
      .delete()
      .eq("event_id", eventId)
      .eq("task_type", taskType);
    setPending(null);
    router.refresh();
  }

  async function assign(taskType: TaskType, playerId: string) {
    if (!playerId) return;
    setPending(taskType);
    const supabase = createClient();
    if (initialTasks[taskType]) {
      await supabase
        .from("event_tasks")
        .update({ player_id: playerId, source: "COACH" })
        .eq("event_id", eventId)
        .eq("task_type", taskType);
    } else {
      await supabase
        .from("event_tasks")
        .insert({
          event_id: eventId,
          task_type: taskType,
          player_id: playerId,
          source: "COACH",
        });
    }
    setPending(null);
    router.refresh();
  }

  async function setSeats(playerId: string, seats: number) {
    setPending("carpool");
    const supabase = createClient();
    await supabase.from("event_carpool_offers").upsert(
      { event_id: eventId, player_id: playerId, seats, updated_at: new Date().toISOString() },
      { onConflict: "event_id,player_id" }
    );
    setPending(null);
    router.refresh();
  }

  const myOffer = initialCarpool.find((o) => myPlayerIds.includes(o.playerId));

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Organisation Parents
      </p>

      {/* Deux colonnes sur écran large, empilées sur mobile — même
          disposition que la liste des événements à venir côté parent. */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {roles.map((role) => {
        const taskType = role.code;
        const assignment = initialTasks[taskType] ?? null;
        const assignedToMe = assignment ? myPlayerIds.includes(assignment.playerId) : false;

        return (
          <div
            key={taskType}
            // Bouton collé au texte plutôt que renvoyé au bord droit.
            className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
          >
            <div className="flex min-w-0 items-center gap-2">
              <RoleIcon icon={role.icon} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-zinc-700">{role.label}</p>
                <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <span className="truncate">
                    {assignment ? assignment.playerName : "Non attribué"}
                  </span>
                  {assignment && <TaskSourceBadge source={assignment.source} />}
                </p>
              </div>
            </div>

            {canAssignAnyone ? (
              <select
                defaultValue={assignment?.playerId ?? ""}
                disabled={pending === taskType}
                onChange={(e) => assign(taskType, e.target.value)}
                className="w-full rounded-full border border-zinc-200 bg-white px-2.5 py-2 text-xs disabled:opacity-60 sm:w-auto"
              >
                <option value="" disabled>
                  Choisir...
                </option>
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            ) : !assignment && myPlayerIds.length > 0 ? (
              <button
                type="button"
                disabled={pending === taskType}
                onClick={() => volunteer(taskType, myPlayerIds[0])}
                className="w-full rounded-full bg-navy px-3 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark disabled:opacity-60 sm:w-auto"
              >
                Je m&apos;en occupe
              </button>
            ) : assignedToMe ? (
              <button
                type="button"
                disabled={pending === taskType}
                onClick={() => withdraw(taskType)}
                className="flex w-full items-center justify-center gap-1 rounded-full border border-zinc-200 px-3 py-2.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-60 sm:w-auto"
              >
                <X className="h-3 w-3" />
                Annuler
              </button>
            ) : null}
          </div>
        );
      })}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="rounded-lg bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 shrink-0 text-emerald-600" />
          <p className="text-xs font-medium text-zinc-700">Covoiturage & trajet</p>
        </div>

        {myPlayerIds.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-xs text-zinc-500" htmlFor={`seats-${eventId}`}>
              Places dispo :
            </label>
            <input
              id={`seats-${eventId}`}
              type="number"
              min={0}
              max={8}
              defaultValue={myOffer?.seats ?? ""}
              disabled={pending === "carpool"}
              onBlur={(e) => {
                const val = e.target.value.trim();
                setSeats(myPlayerIds[0], val ? Number(val) : 0);
              }}
              placeholder="0"
              className="w-16 rounded-full border border-zinc-200 px-2.5 py-2 text-center text-xs disabled:opacity-60"
            />
          </div>
        )}

        {initialCarpool.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {initialCarpool.map((o) => (
              <li
                key={o.playerId}
                className="flex items-center justify-between text-xs text-zinc-600"
              >
                <span className="truncate">{o.playerName}</span>
                <span className="shrink-0 font-semibold text-emerald-700">
                  {o.seats} place{o.seats > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-zinc-400">Aucune place proposée pour l&apos;instant.</p>
        )}
      </div>
    </div>
  );
}
