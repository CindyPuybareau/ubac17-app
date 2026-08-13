"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import AppelExpressModal from "./appel-express-modal";
import { formatPersonName } from "@/lib/names";
import type { RosterPlayer } from "./family-data";

// Le déclencheur seul est client : la carte qui l'accueille reste un
// composant serveur, elle n'a pas besoin d'état pour afficher un effectif.
export default function AppelExpressButton({
  eventId,
  title,
  roster,
  statusByKey,
}: {
  eventId: string;
  title: string;
  roster: RosterPlayer[];
  statusByKey: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  if (roster.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
      >
        <ClipboardCheck className="h-4 w-4 shrink-0" />
        Faire l&apos;appel express
      </button>

      {open && (
        <AppelExpressModal
          eventId={eventId}
          title={title}
          roster={roster.map((p) => ({
            id: p.id,
            name: formatPersonName(p.first_name, p.last_name),
          }))}
          statusByPlayerId={Object.fromEntries(
            roster.map((p) => [p.id, statusByKey[`${eventId}:${p.id}`] ?? "PENDING"])
          )}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
