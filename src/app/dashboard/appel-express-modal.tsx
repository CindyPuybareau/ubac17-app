"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type AttendanceStatus = "PENDING" | "PRESENT" | "ABSENT" | "LATE";

// Un seul geste par joueur : on tape la ligne, le statut avance. Plus
// rapide qu'un menu au bord du terrain, ce qui est tout l'intérêt de
// "l'appel express".
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

function initialStatus(value: string | undefined): AttendanceStatus {
  return value === "PRESENT" || value === "ABSENT" || value === "LATE" ? value : "PENDING";
}

export default function AppelExpressModal({
  eventId,
  title,
  roster,
  statusByPlayerId,
  onClose,
}: {
  eventId: string;
  title: string;
  roster: { id: string; name: string }[];
  statusByPlayerId: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [localStatus, setLocalStatus] = useState<Record<string, AttendanceStatus>>(() => {
    const initial: Record<string, AttendanceStatus> = {};
    roster.forEach((p) => {
      initial[p.id] = initialStatus(statusByPlayerId[p.id]);
    });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cycleStatus(playerId: string) {
    setLocalStatus((prev) => {
      const current = prev[playerId] ?? "PENDING";
      const idx = statusCycle.indexOf(current);
      return { ...prev, [playerId]: statusCycle[(idx + 1) % statusCycle.length] };
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // Seuls les joueurs réellement pointés : un "En attente" resté intact
    // équivaut à l'absence de ligne rsvp, inutile d'en écrire une.
    const entries = Object.entries(localStatus).filter(([, status]) => status !== "PENDING");

    const results = await Promise.all(
      entries.map(async ([playerId, status]) => {
        const { data: existing } = await supabase
          .from("rsvps")
          .select("id")
          .eq("event_id", eventId)
          .eq("player_id", playerId)
          .maybeSingle();
        if (existing) {
          return supabase.from("rsvps").update({ status }).eq("id", existing.id);
        }
        return supabase.from("rsvps").insert({ event_id: eventId, player_id: playerId, status });
      })
    );

    setSaving(false);
    const failed = results.find((r) => r.error)?.error;
    if (failed) {
      setError(failed.message);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
          <h3 className="min-w-0 truncate font-semibold text-zinc-900">Appel — {title}</h3>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <ul className="flex flex-col gap-2">
            {roster.map((p) => {
              const style = statusStyles[localStatus[p.id] ?? "PENDING"];
              return (
                <li key={p.id}>
                  <button
                    onClick={() => cycleStatus(p.id)}
                    className="flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-100 px-4 py-3.5 text-left transition-colors hover:border-ubac-yellow/50"
                  >
                    <span className="min-w-0 truncate font-semibold text-zinc-900">{p.name}</span>
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
            {roster.length === 0 && (
              <p className="text-sm text-zinc-400">Aucun joueur dans cette équipe.</p>
            )}
          </ul>
        </div>
        <div className="border-t border-zinc-100 px-5 py-3">
          {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={saving || roster.length === 0}
            className="w-full rounded-full bg-ubac-yellow px-4 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
          >
            {saving ? "Enregistrement..." : "Valider l'appel"}
          </button>
        </div>
      </div>
    </div>
  );
}
