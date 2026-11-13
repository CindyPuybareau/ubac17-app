"use client";

import { useState } from "react";
import { Check, Lock, MessageSquare, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Motif d'absence facultatif (retour de Cindy du 13/11) : affiché sous les
// boutons Présent/Absent une fois "Absent" choisi. Vu seulement par le
// coach et le Bureau (table rsvp_absence_reasons, jamais lisible par les
// autres familles). Rien n'est lu au chargement de la page (une carte =
// zéro requête) : le motif déjà saisi n'est cherché qu'au moment où on
// ouvre le champ.
export default function AbsenceReasonField({ eventId, playerId }: { eventId: string; playerId: string }) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openField() {
    setOpen(true);
    if (loaded) return;
    const { data } = await createClient()
      .from("rsvp_absence_reasons")
      .select("reason")
      .eq("event_id", eventId)
      .eq("player_id", playerId)
      .maybeSingle();
    setLoaded(true);
    if (data?.reason) {
      setValue(data.reason);
      setSaved(data.reason);
    }
  }

  async function save() {
    const reason = value.trim();
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: writeError } = reason
      ? await supabase
          .from("rsvp_absence_reasons")
          .upsert(
            { event_id: eventId, player_id: playerId, reason, updated_at: new Date().toISOString() },
            { onConflict: "event_id,player_id" }
          )
      : await supabase.from("rsvp_absence_reasons").delete().eq("event_id", eventId).eq("player_id", playerId);
    setSaving(false);
    if (writeError) {
      setError("Motif non enregistré, réessaie.");
      return;
    }
    setSaved(reason || null);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openField}
        className="inline-flex w-fit items-center gap-1 text-xs font-medium text-zinc-500 underline-offset-2 hover:text-navy hover:underline"
      >
        {saved ? <Pencil className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
        {saved ? `Motif : ${saved}` : "Ajouter un motif (facultatif)"}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          maxLength={300}
          autoFocus
          placeholder="Ex. malade, sortie scolaire…"
          className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs focus:border-navy focus:outline-none"
        />
        <button
          type="button"
          onClick={save}
          disabled={saving}
          title="Enregistrer le motif"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-white disabled:opacity-50"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="flex items-center gap-1 text-[11px] text-zinc-400">
        <Lock className="h-3 w-3 shrink-0" />
        Visible seulement par le coach
      </p>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// Au passage à "Présent", un ancien motif d'absence n'a plus de sens : il
// est retiré (rien à faire s'il n'y en avait pas).
export async function clearAbsenceReason(eventId: string, playerId: string) {
  await createClient().from("rsvp_absence_reasons").delete().eq("event_id", eventId).eq("player_id", playerId);
}
