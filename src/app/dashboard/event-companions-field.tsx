"use client";

// "Combien de personnes vous accompagnent ?" (retour de Cindy du 19/11,
// question du comptable pour le Noël de l'UBAC) : affiché sous les
// réponses "Présent" d'un Événement club dont le Bureau a coché la case.
// UN seul nombre pour la famille : recopié sur la réponse de chaque enfant
// présent de ce compte (une seule requête), et compté une fois par famille
// dans le total du Bureau (src/lib/event-companions.ts).
import { useState } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MAX_COMPANIONS } from "@/lib/event-companions";

export default function EventCompanionsField({
  eventId,
  presentPlayerIds,
  initialValue,
}: {
  eventId: string;
  // Licenciés PRÉSENTS de cette famille pour cet événement (au moins un).
  presentPlayerIds: string[];
  initialValue: number;
}) {
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nouvelle valeur venue du serveur (rafraîchissement temps réel, autre
  // parent qui a modifié) : reprise, sauf pendant une écriture en cours.
  const [prevInitial, setPrevInitial] = useState(initialValue);
  if (initialValue !== prevInitial) {
    setPrevInitial(initialValue);
    if (!saving) setValue(initialValue);
  }

  async function change(next: number) {
    const clamped = Math.max(0, Math.min(MAX_COMPANIONS, next));
    if (clamped === value || presentPlayerIds.length === 0) return;
    const previous = value;
    setValue(clamped);
    setSaving(true);
    setError(null);
    const { error: writeError, data } = await createClient()
      .from("rsvps")
      .update({ companions: clamped })
      .eq("event_id", eventId)
      .in("player_id", presentPlayerIds)
      .select("player_id");
    setSaving(false);
    if (writeError || !data || data.length === 0) {
      setValue(previous);
      setError("Nombre non enregistré, réessaie.");
    }
  }

  const buttonClass =
    "flex h-7 w-7 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition-colors hover:border-navy/40 hover:text-navy disabled:opacity-40";

  return (
    <div className="flex flex-col gap-1 rounded-xl border border-navy/10 bg-navy/[0.03] px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-zinc-700">
          <Users className="h-3.5 w-3.5 shrink-0 text-navy" />
          Combien de personnes vous accompagnent ?
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => change(value - 1)}
            disabled={value <= 0}
            aria-label="Une personne de moins"
            className={buttonClass}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-5 text-center text-sm font-bold tabular-nums text-zinc-900" aria-live="polite">
            {value}
          </span>
          <button
            type="button"
            onClick={() => change(value + 1)}
            disabled={value >= MAX_COMPANIONS}
            aria-label="Une personne de plus"
            className={buttonClass}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {presentPlayerIds.length > 1 && (
        <p className="text-[11px] text-zinc-500">Un seul nombre pour toute la famille.</p>
      )}
      {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
