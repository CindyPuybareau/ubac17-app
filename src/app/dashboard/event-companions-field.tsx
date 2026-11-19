"use client";

// "Combien de personnes vous accompagnent ?" (retour de Cindy du 19/11,
// question du comptable pour le Noël de l'UBAC) : affiché sous les
// réponses "Présent" d'un Événement club dont le Bureau a coché la case.
// UN seul nombre pour la famille : recopié sur la réponse de chaque enfant
// présent de ce compte (une seule requête), et compté une fois par famille
// dans le total du Bureau (src/lib/event-companions.ts).
import { useEffect, useState } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MAX_COMPANIONS } from "@/lib/event-companions";

export default function EventCompanionsField({
  eventId,
  presentPlayerIds,
  initialValue,
  onSaved,
  familyPlayerIds,
}: {
  eventId: string;
  // Tous les licenciés de la famille (présents ou non à l'écran) : lecture
  // et écriture visent ceux qui sont PRÉSENTS EN BASE, jamais une liste
  // d'écran éventuellement en retard (changement d'onglet enfant).
  familyPlayerIds?: string[];
  // Prévient la carte de l'événement (calendar-view.tsx) : un frère ou une
  // sœur qui passe "Présent" ensuite reçoit directement ce nombre.
  onSaved?: (value: number) => void;
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

  // Relecture du vrai nombre de la famille à l'ouverture et quand la liste
  // des présents change (test du 19/11 : après un changement d'onglet
  // enfant, l'écran pouvait afficher un nombre en retard). Lecture seule.
  const familyIds = familyPlayerIds && familyPlayerIds.length > 0 ? familyPlayerIds : presentPlayerIds;
  const presentKey = [...familyIds].sort().join(",");
  useEffect(() => {
    if (!presentKey) return;
    let stale = false;
    void createClient()
      .from("rsvps")
      .select("companions")
      .eq("event_id", eventId)
      .eq("status", "PRESENT")
      .in("player_id", presentKey.split(","))
      .then(({ data }) => {
        if (stale || !data) return;
        setValue(Math.max(0, ...data.map((r) => r.companions ?? 0)));
      });
    return () => {
      stale = true;
    };
  }, [eventId, presentKey]);

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
      .eq("status", "PRESENT")
      .in("player_id", familyIds)
      .select("player_id");
    setSaving(false);
    if (writeError || !data || data.length === 0) {
      setValue(previous);
      setError("Nombre non enregistré, réessaie.");
      return;
    }
    onSaved?.(clamped);
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
