"use client";

import { useState } from "react";
import { Navigation, Car } from "lucide-react";

function carpoolMailto(kind: "offer" | "request", context: string) {
  const subject = encodeURIComponent(`Covoiturage - ${context}`);
  const body = encodeURIComponent(
    kind === "offer"
      ? "Bonjour à tous,\n\nJe propose des places dans ma voiture pour ce déplacement. Répondez-moi si vous êtes intéressé(e) !\n\nMerci."
      : "Bonjour à tous,\n\nJe recherche une place pour ce déplacement. Merci de me faire signe si vous avez de la place disponible !"
  );
  return `mailto:?subject=${subject}&body=${body}`;
}

export default function NextMatchActions({
  location,
  context,
}: {
  location: string | null;
  context: string;
}) {
  const [openCarpool, setOpenCarpool] = useState(false);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {location && (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-full bg-navy px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
        >
          <Navigation className="h-3.5 w-3.5" />
          Y aller (GPS)
        </a>
      )}

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
              onClick={() => setOpenCarpool(false)}
              className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Proposer des places
            </a>
            <a
              href={carpoolMailto("request", context)}
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
