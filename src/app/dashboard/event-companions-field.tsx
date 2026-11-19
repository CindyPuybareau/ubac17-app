"use client";

// "Combien de personnes vous accompagnent ?" (retour de Cindy du 19/11,
// question du comptable pour le Noël de l'UBAC) : affiché sous les
// réponses "Présent" d'un Événement club dont le Bureau a coché la case.
// UN seul nombre pour la famille : recopié sur la réponse de chaque enfant
// présent de ce compte (une seule requête), et compté une fois par famille
// dans le total du Bureau (src/lib/event-companions.ts).
import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MAX_COMPANIONS } from "@/lib/event-companions";

// "Léonie", "Léonie et Raphaël", "Léonie, Raphaël et Basile".
function joinNames(names: string[]) {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

export default function EventCompanionsField({
  eventId,
  presentPlayerIds,
  initialValue,
  onSaved,
  familyPlayerIds,
  presentNames = [],
}: {
  eventId: string;
  // Prénoms des licenciés de la famille déjà notés "Présent" (retour de
  // Cindy du 19/11) : "Combien de personnes viennent en plus de Léonie et
  // Raphaël ?" -- dit exactement qui est déjà compté.
  presentNames?: string[];
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
  // Écriture en cours : une relecture qui arriverait pendant ce temps ne
  // doit pas écraser le nombre qu'on est en train d'enregistrer.
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);


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
        if (stale || !data || savingRef.current) return;
        setValue(Math.max(0, ...data.map((r) => r.companions ?? 0)));
      });
    return () => {
      stale = true;
    };
    // initialValue en dépendance : chaque rafraîchissement de la page (temps
    // réel, autre parent qui a modifié) relit le VRAI nombre en base plutôt
    // que de reprendre l'instantané de la page, parfois antérieur au dernier
    // clic (test du 19/11 sur le Noël : 2 -> 0 -> 2 pendant une seconde).
  }, [eventId, presentKey, initialValue]);

  async function change(next: number) {
    const clamped = Math.max(0, Math.min(MAX_COMPANIONS, next));
    if (clamped === value || presentPlayerIds.length === 0) return;
    const previous = value;
    setValue(clamped);
    savingRef.current = true;
    setError(null);
    const { error: writeError, data } = await createClient()
      .from("rsvps")
      .update({ companions: clamped })
      .eq("event_id", eventId)
      .eq("status", "PRESENT")
      .in("player_id", familyIds)
      .select("player_id");
    savingRef.current = false;
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
          {presentNames.length > 0
            ? `Combien de personnes viennent en plus de ${joinNames(presentNames)} ?`
            : "Combien de personnes vous accompagnent ?"}
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
      {error && <p className="text-[11px] font-semibold text-red-600">{error}</p>}
    </div>
  );
}
