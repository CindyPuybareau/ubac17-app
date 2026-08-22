"use client";

import { useState } from "react";
import { Check, Clock, Undo2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatFirstName, formatLastName, formatPersonName } from "@/lib/names";
import type { RosterPlayer } from "./family-data";

type Group = {
  key: "ABSENT" | "PRESENT" | "PENDING";
  label: string;
  Icon: typeof Check;
  headerClass: string;
  badgeClass: string;
};

// L'absent passe en premier : c'est la réponse sur laquelle un coach doit
// réagir (trouver un remplaçant), pas le présent qui ne demande rien.
const GROUPS: Group[] = [
  {
    key: "ABSENT",
    label: "Absents",
    Icon: X,
    headerClass: "text-rose-700",
    badgeClass: "border border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    key: "PRESENT",
    label: "Présents",
    Icon: Check,
    headerClass: "text-emerald-700",
    badgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    key: "PENDING",
    label: "En attente",
    Icon: Clock,
    headerClass: "text-slate-500",
    badgeClass: "border border-slate-200 bg-slate-100 text-slate-600",
  },
];

function groupOf(status: string | null | undefined): Group["key"] {
  if (status === "ABSENT") return "ABSENT";
  // Un retard annoncé reste une venue : le compter avec les présents évite
  // de le faire passer pour une réponse manquante.
  if (status === "PRESENT" || status === "LATE") return "PRESENT";
  return "PENDING";
}

// Remplace la liste de prénoms séparés par des virgules : illisible passé
// dix joueurs, et muette sur qui a répondu quoi.
export default function AttendanceBadges({
  eventId,
  roster,
  statusByKey,
  reasonByKey = {},
  // Le coach doit pouvoir corriger la réponse d'un joueur (retour de
  // Cindy du 2026-08-22 : "si un joueur se dit présent et qu'il n'est
  // finalement pas présent... le coach doit pouvoir le mettre en absent,
  // ou le supprimer des présents pour qu'il rebascule en non présent") —
  // faux par défaut : côté Famille/Parent, ces badges restent un simple
  // résumé en lecture seule, pas question de laisser un parent modifier
  // la réponse d'un autre enfant.
  canManage = false,
}: {
  eventId: string;
  roster: RosterPlayer[];
  statusByKey: Record<string, string>;
  reasonByKey?: Record<string, string | null>;
  canManage?: boolean;
}) {
  // Réponses corrigées localement, en attendant que le prochain
  // rafraîchissement temps réel (rsvps est surveillée, realtime-sync.tsx)
  // rattrape le reste de l'écran — même bascule optimiste que
  // rsvp-control.tsx, pour un retour instantané au clic.
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  // Repart de zéro quand statusByKey change (nouvel événement, ou
  // rafraîchissement temps réel qui rattrape enfin nos écritures) —
  // ajusté pendant le rendu plutôt que dans un effet, pour éviter un
  // rendu supplémentaire inutile (cf. règle eslint react-hooks/set-state-in-effect).
  const [prevStatusByKey, setPrevStatusByKey] = useState(statusByKey);
  if (statusByKey !== prevStatusByKey) {
    setPrevStatusByKey(statusByKey);
    setOverrides({});
  }

  const [editingPlayer, setEditingPlayer] = useState<RosterPlayer | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function statusFor(playerId: string) {
    const key = `${eventId}:${playerId}`;
    return key in overrides ? overrides[key] : statusByKey[key];
  }

  async function setStatus(playerId: string, next: "PRESENT" | "ABSENT") {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: writeError } = await supabase
      .from("rsvps")
      .upsert(
        { event_id: eventId, player_id: playerId, status: next },
        { onConflict: "event_id,player_id" }
      );
    setSaving(false);
    if (writeError) {
      setError(writeError.message);
      return;
    }
    setOverrides((prev) => ({ ...prev, [`${eventId}:${playerId}`]: next }));
    setEditingPlayer(null);
  }

  async function clearStatus(playerId: string) {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: deleteError } = await supabase
      .from("rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("player_id", playerId);
    setSaving(false);
    if (deleteError) {
      setError("Annulation impossible, réessaie.");
      return;
    }
    setOverrides((prev) => ({ ...prev, [`${eventId}:${playerId}`]: null }));
    setEditingPlayer(null);
  }

  if (roster.length === 0) {
    return <p className="text-sm text-zinc-400">Aucun joueur dans cette équipe.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {GROUPS.map((group) => {
        const members = roster.filter((p) => groupOf(statusFor(p.id)) === group.key);
        if (members.length === 0) return null;

        return (
          <div key={group.key} className="flex flex-col gap-1.5">
            <p
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${group.headerClass}`}
            >
              <group.Icon className="h-3.5 w-3.5 shrink-0" />
              {group.label} ({members.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((p) => {
                const reason = reasonByKey[`${eventId}:${p.id}`];
                const Tag = canManage ? "button" : "span";
                return (
                  <Tag
                    key={p.id}
                    type={canManage ? "button" : undefined}
                    onClick={canManage ? () => setEditingPlayer(p) : undefined}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${group.badgeClass} ${
                      canManage ? "cursor-pointer transition-opacity hover:opacity-70" : ""
                    }`}
                  >
                    <span className="font-bold">{formatLastName(p.last_name) || "—"}</span>
                    {formatFirstName(p.first_name)}
                    {/* Le motif n'apparaît que sur une absence renseignée :
                        c'est l'information qui décide d'un remplacement. */}
                    {group.key === "ABSENT" && reason && (
                      <span className="font-normal opacity-80">— {reason}</span>
                    )}
                  </Tag>
                );
              })}
            </div>
          </div>
        );
      })}

      {editingPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setEditingPlayer(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 font-semibold text-zinc-900">
              {formatPersonName(editingPlayer.first_name, editingPlayer.last_name, "Ce joueur")}
            </h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setStatus(editingPlayer.id, "PRESENT")}
                className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
              >
                <Check className="h-4 w-4 shrink-0" />
                Marquer présent
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => setStatus(editingPlayer.id, "ABSENT")}
                className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-100 disabled:opacity-60"
              >
                <X className="h-4 w-4 shrink-0" />
                Marquer absent
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => clearStatus(editingPlayer.id)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-60"
              >
                <Undo2 className="h-4 w-4 shrink-0" />
                Effacer la réponse (revient à « en attente »)
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              type="button"
              disabled={saving}
              onClick={() => setEditingPlayer(null)}
              className="mt-3 w-full rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
