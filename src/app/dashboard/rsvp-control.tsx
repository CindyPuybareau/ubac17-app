"use client";

import { useState } from "react";
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

// Retour de Cindy du 09/09 (phase 1 UX, couleurs sémantiques) : status-*
// (globals.css) plutôt qu'emerald/rose/amber codées en dur -- même
// migration que attendance-badges.tsx/rsvp-segment.ts/calendar-view.tsx/
// child-calendar-tab.tsx. LATE (retard annoncé) rejoint "en attente"
// (orange) : une venue plus tardive reste une forme d'attente, pas un
// vrai succès ni une urgence. PENDING (aucune réponse, pas un vrai statut
// vert/orange/rouge) garde un gris neutre.
function badgeFor(status: Status) {
  if (status === "PRESENT")
    return { label: "Confirmé présent", className: "bg-status-success/15 text-status-success", Icon: Check };
  if (status === "ABSENT")
    return { label: "Noté absent", className: "bg-status-urgent/15 text-status-urgent-dark", Icon: X };
  if (status === "LATE")
    return { label: "Retard annoncé", className: "bg-status-pending/15 text-status-pending-dark", Icon: Clock };
  return { label: "Réponse attendue", className: "bg-zinc-100 text-zinc-500", Icon: Clock };
}

// Répondre présent/absent depuis la carte de l'événement, sans passer par
// une page de détail. L'écriture est optimiste : le badge bascule tout de
// suite en local (setStatus) ; rsvps étant surveillée en temps réel
// (realtime-sync.tsx), pas besoin d'un router.refresh() en plus pour
// réaligner le reste de l'écran — ça rechargeait la page deux fois pour un
// seul clic (retour de Cindy du 2026-08-20, même correctif que
// rsvp-buttons.tsx/volunteer-needs-panel.tsx).
const CONTRIBUTION_NOTE_MAX_LENGTH = 120;

export default function RsvpControl({
  eventId,
  playerId,
  playerName,
  currentStatus,
  hasOrganisationNeeds = false,
  currentNote = null,
}: {
  eventId: string;
  playerId: string;
  // Affiché seulement quand la famille suit plusieurs enfants.
  playerName?: string;
  currentStatus: string;
  // Retour de Cindy du 10/09 ("ce que j'apporte") : même principe que
  // rsvp-buttons.tsx (voir son commentaire) -- calculé par l'appelant à
  // partir de volunteerNeedsByEventId, jamais recalculé ici.
  hasOrganisationNeeds?: boolean;
  currentNote?: string | null;
}) {
  const [status, setStatus] = useState<Status>(
    currentStatus === "PRESENT" || currentStatus === "ABSENT" || currentStatus === "LATE"
      ? currentStatus
      : "PENDING"
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(currentNote ?? "");
  const [noteSaved, setNoteSaved] = useState(true);

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
      // Message générique par le passé, sans la vraie cause — même
      // correctif que rsvp-buttons.tsx (retour de Cindy du 2026-08-20).
      setError(writeError.message);
      return;
    }
    setStatus(next);
  }

  // Retour de Cindy du 10/09 ("ce que j'apporte") : même principe que
  // rsvp-buttons.tsx (voir son commentaire) -- upsert avec status:
  // "PRESENT" explicite, sauvegardé au blur du champ.
  async function saveNote() {
    const trimmed = note.trim();
    if (trimmed === (currentNote ?? "").trim()) return;
    setNoteSaved(false);
    const supabase = createClient();
    const { error: writeError } = await supabase
      .from("rsvps")
      .upsert(
        { event_id: eventId, player_id: playerId, status: "PRESENT", contribution_note: trimmed || null },
        { onConflict: "event_id,player_id" }
      );
    setNoteSaved(true);
    if (writeError) {
      setError(writeError.message);
    }
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

      {/* Retour de Cindy du 10/09 ("ce que j'apporte") : voir le commentaire
          sur hasOrganisationNeeds plus haut. */}
      {status === "PRESENT" && hasOrganisationNeeds && (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, CONTRIBUTION_NOTE_MAX_LENGTH))}
          onBlur={saveNote}
          maxLength={CONTRIBUTION_NOTE_MAX_LENGTH}
          placeholder="Ce que j'apporte (optionnel)"
          className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs text-zinc-700 placeholder:text-zinc-400"
        />
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {!noteSaved && <p className="text-xs text-zinc-400">Enregistrement...</p>}
    </div>
  );
}
