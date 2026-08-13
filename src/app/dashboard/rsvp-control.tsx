"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Status = "PRESENT" | "ABSENT" | "LATE" | "PENDING";

function badgeFor(status: Status) {
  if (status === "PRESENT")
    return { label: "Confirmé présent", className: "bg-green-100 text-green-700", Icon: Check };
  if (status === "ABSENT")
    return { label: "Noté absent", className: "bg-red-100 text-red-700", Icon: X };
  if (status === "LATE")
    return { label: "Retard annoncé", className: "bg-amber-100 text-amber-700", Icon: Clock };
  return { label: "Réponse attendue", className: "bg-zinc-100 text-zinc-500", Icon: Clock };
}

// Répondre présent/absent depuis la carte de l'événement, sans passer par
// une page de détail. L'écriture est optimiste : le badge bascule tout de
// suite, le router.refresh() ne sert qu'à réaligner le reste de l'écran.
export default function RsvpControl({
  eventId,
  playerId,
  playerName,
  currentStatus,
  currentReason,
}: {
  eventId: string;
  playerId: string;
  // Affiché seulement quand la famille suit plusieurs enfants.
  playerName?: string;
  currentStatus: string;
  currentReason?: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(
    currentStatus === "PRESENT" || currentStatus === "ABSENT" || currentStatus === "LATE"
      ? currentStatus
      : "PENDING"
  );
  const [reason, setReason] = useState(currentReason ?? "");
  const [askReason, setAskReason] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Status, nextReason: string | null) {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    // Pas d'upsert : rsvps n'a pas de contrainte unique sur
    // (event_id, player_id), un onConflict échouerait donc.
    const { data: existing } = await supabase
      .from("rsvps")
      .select("id")
      .eq("event_id", eventId)
      .eq("player_id", playerId)
      .maybeSingle();

    const payload = { status: next, reason: nextReason };
    const { error: writeError } = existing
      ? await supabase.from("rsvps").update(payload).eq("id", existing.id)
      : await supabase
          .from("rsvps")
          .insert({ event_id: eventId, player_id: playerId, ...payload });

    setSaving(false);
    if (writeError) {
      setError("Réponse non enregistrée, réessaie.");
      return;
    }
    setStatus(next);
    setAskReason(false);
    router.refresh();
  }

  const badge = badgeFor(status);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {playerName && (
          <span className="text-xs font-medium text-zinc-500">{playerName}</span>
        )}
        <span
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}
        >
          <badge.Icon className="h-3 w-3 shrink-0" />
          {badge.label}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => save("PRESENT", null)}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
            status === "PRESENT"
              ? "bg-green-600 text-white"
              : "border border-green-600 text-green-700 hover:bg-green-50"
          }`}
        >
          <Check className="h-4 w-4 shrink-0" />
          Présent
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => setAskReason((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
            status === "ABSENT"
              ? "bg-red-600 text-white"
              : "border border-red-600 text-red-700 hover:bg-red-50"
          }`}
        >
          <X className="h-4 w-4 shrink-0" />
          Absent
        </button>
      </div>

      {askReason && (
        // Le motif reste facultatif : "Valider l'absence" fonctionne avec
        // un champ vide, on ne bloque pas une réponse pour un commentaire.
        <div className="flex flex-col gap-2 rounded-xl border border-red-100 bg-red-50/60 p-3">
          <label className="text-xs font-medium text-zinc-600" htmlFor={`reason-${eventId}-${playerId}`}>
            Motif de l&apos;absence (facultatif)
          </label>
          <input
            id={`reason-${eventId}-${playerId}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Blessure, vacances, examen..."
            className="rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-red-300"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAskReason(false)}
              className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => save("ABSENT", reason.trim() || null)}
              className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Valider l'absence"}
            </button>
          </div>
        </div>
      )}

      {status === "ABSENT" && !askReason && reason && (
        <p className="text-xs text-zinc-500">Motif : {reason}</p>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
