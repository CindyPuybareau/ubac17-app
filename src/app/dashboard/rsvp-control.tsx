"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Clock, Undo2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  SEGMENT_ABSENT_ON,
  SEGMENT_BUTTON,
  SEGMENT_GROUP,
  SEGMENT_OFF,
  SEGMENT_PRESENT_ON,
} from "./rsvp-segment";

type Status = "PRESENT" | "ABSENT" | "LATE" | "PENDING";

function badgeFor(status: Status) {
  if (status === "PRESENT")
    return { label: "Confirmé présent", className: "bg-emerald-100 text-emerald-800", Icon: Check };
  if (status === "ABSENT")
    return { label: "Noté absent", className: "bg-rose-100 text-rose-800", Icon: X };
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
}: {
  eventId: string;
  playerId: string;
  // Affiché seulement quand la famille suit plusieurs enfants.
  playerName?: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(
    currentStatus === "PRESENT" || currentStatus === "ABSENT" || currentStatus === "LATE"
      ? currentStatus
      : "PENDING"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: Status) {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    // Vrai upsert, plus de select-puis-écrit : rsvps a maintenant une
    // contrainte unique sur (event_id, player_id), qui rend cet onConflict
    // possible — l'ancien "lire, puis choisir insert/update" laissait une
    // fenêtre où deux réponses simultanées pour la même personne pouvaient
    // créer deux lignes au lieu d'une.
    const { error: writeError } = await supabase
      .from("rsvps")
      .upsert(
        { event_id: eventId, player_id: playerId, status: next },
        { onConflict: "event_id,player_id" }
      );

    setSaving(false);
    if (writeError) {
      setError("Réponse non enregistrée, réessaie.");
      return;
    }
    setStatus(next);
    router.refresh();
  }

  // Revenir à "en attente", c'est supprimer la ligne : l'app lit déjà
  // l'absence de réponse ainsi. Utile en cas de faute de frappe.
  async function clearAnswer() {
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
    setStatus("PENDING");
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

      {/* Segmented control : les deux réponses sont un même choix, pas deux
          actions indépendantes — les enfermer dans un seul cadre le dit. */}
      <div className={SEGMENT_GROUP}>
        <button
          type="button"
          disabled={saving}
          onClick={() => save("PRESENT")}
          className={`${SEGMENT_BUTTON} ${
            status === "PRESENT" ? SEGMENT_PRESENT_ON : SEGMENT_OFF
          }`}
        >
          <Check className="h-3.5 w-3.5 shrink-0" />
          Présent
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => save("ABSENT")}
          className={`${SEGMENT_BUTTON} ${
            status === "ABSENT" ? SEGMENT_ABSENT_ON : SEGMENT_OFF
          }`}
        >
          <X className="h-3.5 w-3.5 shrink-0" />
          Absent
        </button>

        {/* Ne s'affiche qu'une fois une réponse donnée : il n'y a rien à
            annuler tant qu'on n'a pas répondu — utile en cas de faute de
            frappe plutôt qu'une vraie absence. */}
        {status !== "PENDING" && (
          <button
            type="button"
            disabled={saving}
            onClick={clearAnswer}
            title="Revenir à « en attente »"
            className={`${SEGMENT_BUTTON} ${SEGMENT_OFF}`}
          >
            <Undo2 className="h-3.5 w-3.5 shrink-0" />
            Annuler
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
