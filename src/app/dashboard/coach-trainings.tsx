"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Clock, MapPin, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AdminUpcomingEvent } from "./page";
import type { TeamWithMembers } from "./team-manager";

type AttendanceStatus = "PENDING" | "PRESENT" | "ABSENT" | "LATE";

const statusCycle: AttendanceStatus[] = ["PENDING", "PRESENT", "ABSENT", "LATE"];

const statusStyles: Record<
  AttendanceStatus,
  { label: string; dotClassName: string | null; className: string }
> = {
  PENDING: { label: "En attente", dotClassName: null, className: "bg-zinc-100 text-zinc-500" },
  PRESENT: { label: "Présent", dotClassName: "bg-green-500", className: "bg-green-100 text-green-700" },
  ABSENT: { label: "Absent", dotClassName: "bg-red-500", className: "bg-red-100 text-red-700" },
  LATE: { label: "Retard", dotClassName: "bg-amber-500", className: "bg-amber-100 text-amber-700" },
};

export default function CoachTrainings({
  events,
  teams,
  rsvpStatusByKey,
}: {
  events: AdminUpcomingEvent[];
  teams: TeamWithMembers[];
  rsvpStatusByKey: Record<string, string>;
}) {
  const router = useRouter();
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<Record<string, AttendanceStatus>>({});
  const [saving, setSaving] = useState(false);

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const trainings = useMemo(
    () =>
      [...events]
        .filter((e) => e.event_type === "TRAINING")
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime()),
    [events]
  );

  function openAppel(event: AdminUpcomingEvent) {
    const roster = event.teamId ? teamsById.get(event.teamId)?.players ?? [] : [];
    const initial: Record<string, AttendanceStatus> = {};
    roster.forEach((p) => {
      const key = `${event.id}:${p.id}`;
      const known = rsvpStatusByKey[key];
      initial[p.id] =
        known === "PRESENT" || known === "ABSENT" || known === "LATE" ? known : "PENDING";
    });
    setLocalStatus(initial);
    setOpenEventId(event.id);
  }

  function cycleStatus(playerId: string) {
    setLocalStatus((prev) => {
      const current = prev[playerId] ?? "PENDING";
      const idx = statusCycle.indexOf(current);
      const next = statusCycle[(idx + 1) % statusCycle.length];
      return { ...prev, [playerId]: next };
    });
  }

  async function saveAppel() {
    if (!openEventId) return;
    setSaving(true);
    const supabase = createClient();
    // Only players the coach actually tapped (skip untouched "En attente" —
    // that's the same as no rsvp row at all, no need to write one).
    const entries = Object.entries(localStatus).filter(([, status]) => status !== "PENDING");

    const results = await Promise.all(
      entries.map(async ([playerId, status]) => {
        const { data: existing } = await supabase
          .from("rsvps")
          .select("id")
          .eq("event_id", openEventId)
          .eq("player_id", playerId)
          .maybeSingle();
        if (existing) {
          return supabase.from("rsvps").update({ status }).eq("id", existing.id);
        }
        return supabase
          .from("rsvps")
          .insert({ event_id: openEventId, player_id: playerId, status });
      })
    );

    setSaving(false);
    const err = results.find((r) => r.error)?.error;
    if (!err) {
      setOpenEventId(null);
      router.refresh();
    }
  }

  const openEvent = trainings.find((e) => e.id === openEventId) ?? null;
  const openTeam = openEvent?.teamId ? teamsById.get(openEvent.teamId) : null;
  const openRoster = openTeam?.players ?? [];

  return (
    <div className="flex flex-col gap-4">
      {trainings.map((e) => {
        const team = e.teamId ? teamsById.get(e.teamId) : null;
        return (
          <div key={e.id} className="rounded-2xl border border-t-4 border-zinc-100 border-t-ubac-yellow bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {team?.name ?? "Équipe"}
                </p>
                <h3 className="truncate font-semibold text-zinc-900">
                  {e.title ?? "Entraînement"}
                </h3>
              </div>
              <span className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide text-green-700">
                Entraînement
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-4 w-4" />
                {new Date(e.start_time).toLocaleString("fr-FR", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {e.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {e.location}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold leading-none text-green-700">
                <Check className="h-3 w-3" />
                {e.rsvpCounts.present} présent{e.rsvpCounts.present > 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold leading-none text-red-700">
                <X className="h-3 w-3" />
                {e.rsvpCounts.absent} absent{e.rsvpCounts.absent > 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold leading-none text-zinc-600">
                <Clock className="h-3 w-3" />
                {e.rsvpCounts.pending} en attente
              </span>
            </div>
            <button
              onClick={() => openAppel(e)}
              className="mt-3 w-full rounded-full bg-ubac-yellow px-4 py-3 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
            >
              Faire l&apos;appel express
            </button>
          </div>
        );
      })}
      {trainings.length === 0 && (
        <p className="text-sm text-zinc-500">Aucun entraînement programmé.</p>
      )}

      {openEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h3 className="font-semibold text-zinc-900">
                Appel — {openTeam?.name ?? "Équipe"}
              </h3>
              <button
                onClick={() => setOpenEventId(null)}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <ul className="flex flex-col gap-2">
                {openRoster.map((p) => {
                  const status = localStatus[p.id] ?? "PENDING";
                  const style = statusStyles[status];
                  return (
                    <li key={p.id}>
                      <button
                        onClick={() => cycleStatus(p.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-100 px-4 py-3.5 text-left transition-colors hover:border-ubac-yellow/50"
                      >
                        <span className="min-w-0 truncate font-medium text-zinc-900">
                          {[p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom"}
                        </span>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${style.className}`}
                        >
                          {style.dotClassName && (
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dotClassName}`} />
                          )}
                          {style.label}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {openRoster.length === 0 && (
                  <p className="text-sm text-zinc-400">Aucun joueur dans cette équipe.</p>
                )}
              </ul>
            </div>
            <div className="border-t border-zinc-100 px-5 py-3">
              <button
                onClick={saveAppel}
                disabled={saving}
                className="w-full rounded-full bg-ubac-yellow px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : "Valider l'appel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
