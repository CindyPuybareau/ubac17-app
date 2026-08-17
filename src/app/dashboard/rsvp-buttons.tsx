"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  SEGMENT_ABSENT_ON,
  SEGMENT_BUTTON,
  SEGMENT_GROUP,
  SEGMENT_OFF,
  SEGMENT_PRESENT_ON,
} from "./rsvp-segment";

export default function RsvpButtons({
  eventId,
  playerId,
  currentStatus,
}: {
  eventId: string;
  playerId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // La carte qui affiche ce bouton (NextConvocationCard) n'est pas
  // remontée quand "le prochain événement" change (même clé React) — un
  // router.refresh() déclenché ailleurs sur la page pouvait alors faire
  // passer eventId/currentStatus à un tout autre rendez-vous sans que ce
  // composant s'en aperçoive, gardant affiché le statut du précédent
  // (ex. "Absent" du match de samedi affiché à tort sur l'entraînement de
  // mercredi).
  useEffect(() => {
    setStatus(currentStatus);
    setError(false);
  }, [eventId, currentStatus]);

  async function respond(newStatus: "PRESENT" | "ABSENT") {
    setLoading(true);
    setError(false);
    const supabase = createClient();

    // Vrai upsert : rsvps a maintenant une contrainte unique sur
    // (event_id, player_id), donc plus besoin de lire avant d'écrire pour
    // choisir insert/update — ça fermait la fenêtre où deux réponses
    // simultanées pour la même personne pouvaient créer deux lignes.
    const { error: writeError } = await supabase
      .from("rsvps")
      .upsert(
        { event_id: eventId, player_id: playerId, status: newStatus },
        { onConflict: "event_id,player_id" }
      );

    setLoading(false);
    if (writeError) {
      setError(true);
      return;
    }

    setStatus(newStatus);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className={SEGMENT_GROUP}>
        <button
          disabled={loading}
          onClick={() => respond("PRESENT")}
          className={`${SEGMENT_BUTTON} ${
            status === "PRESENT" ? SEGMENT_PRESENT_ON : SEGMENT_OFF
          }`}
        >
          <Check className="h-3.5 w-3.5 shrink-0" />
          Présent
        </button>
        <button
          disabled={loading}
          onClick={() => respond("ABSENT")}
          className={`${SEGMENT_BUTTON} ${
            status === "ABSENT" ? SEGMENT_ABSENT_ON : SEGMENT_OFF
          }`}
        >
          <X className="h-3.5 w-3.5 shrink-0" />
          Absent
        </button>
      </div>
      {error && <p className="text-[11px] text-red-600">Réponse non enregistrée, réessaie.</p>}
    </div>
  );
}
