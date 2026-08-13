"use client";

import { useState } from "react";
import { Car } from "lucide-react";
import ItineraryButton from "./itinerary-button";
import { buildGmailComposeLink } from "@/lib/email";

function carpoolMailto(kind: "offer" | "request", context: string) {
  return buildGmailComposeLink({
    subject: `Covoiturage - ${context}`,
    body:
      kind === "offer"
        ? "Bonjour à tous,\n\nJe propose des places dans ma voiture pour ce déplacement. Répondez-moi si vous êtes intéressé(e) !\n\nMerci."
        : "Bonjour à tous,\n\nJe recherche une place pour ce déplacement. Merci de me faire signe si vous avez de la place disponible !",
  });
}

export default function NextMatchActions({
  venue,
  context,
  showCarpool,
}: {
  // Adresse déjà résolue par venueQuery : une salle du club vaut son
  // adresse postale, un déplacement le lieu saisi par le coach.
  venue: string | null;
  context: string;
  // Même règle que le bloc Covoiturage du panneau Organisation : sans quoi
  // le bouton continuerait de s'afficher sur un entraînement alors que le
  // reste du covoiturage y a disparu.
  showCarpool: boolean;
}) {
  const [openCarpool, setOpenCarpool] = useState(false);

  // Plus rien à proposer : une barre d'actions vide laisserait un blanc.
  if (!venue && !showCarpool) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <ItineraryButton
        query={venue}
        className="flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
      />

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenCarpool((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
        >
          <Car className="h-3.5 w-3.5" />
          Covoiturage
        </button>
        {openCarpool && (
          <div className="absolute left-0 top-full z-10 mt-1 flex w-48 flex-col gap-1 rounded-xl border border-zinc-100 bg-white p-1.5 shadow-lg">
            <a
              href={carpoolMailto("offer", context)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpenCarpool(false)}
              className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Proposer des places
            </a>
            <a
              href={carpoolMailto("request", context)}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpenCarpool(false)}
              className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Demander un trajet
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
