import { Check, Clock, X } from "lucide-react";
import { formatFirstName, formatLastName } from "@/lib/names";
import type { RosterPlayer } from "./family-data";

type Group = {
  key: "ABSENT" | "PRESENT" | "PENDING";
  label: string;
  Icon: typeof Check;
  headerClass: string;
  badgeClass: string;
};

// L'absent passe en premier : c'est la réponse sur laquelle un coach doit
// réagir (trouver un remplaçant), pas le présent qui ne demande rien.
const GROUPS: Group[] = [
  {
    key: "ABSENT",
    label: "Absents",
    Icon: X,
    headerClass: "text-rose-700",
    badgeClass: "border border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    key: "PRESENT",
    label: "Présents",
    Icon: Check,
    headerClass: "text-emerald-700",
    badgeClass: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  {
    key: "PENDING",
    label: "En attente",
    Icon: Clock,
    headerClass: "text-slate-500",
    badgeClass: "border border-slate-200 bg-slate-100 text-slate-600",
  },
];

function groupOf(status: string | undefined): Group["key"] {
  if (status === "ABSENT") return "ABSENT";
  // Un retard annoncé reste une venue : le compter avec les présents évite
  // de le faire passer pour une réponse manquante.
  if (status === "PRESENT" || status === "LATE") return "PRESENT";
  return "PENDING";
}

// Remplace la liste de prénoms séparés par des virgules : illisible passé
// dix joueurs, et muette sur qui a répondu quoi.
export default function AttendanceBadges({
  eventId,
  roster,
  statusByKey,
  reasonByKey = {},
}: {
  eventId: string;
  roster: RosterPlayer[];
  statusByKey: Record<string, string>;
  reasonByKey?: Record<string, string | null>;
}) {
  if (roster.length === 0) {
    return <p className="text-sm text-zinc-400">Aucun joueur dans cette équipe.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {GROUPS.map((group) => {
        const members = roster.filter(
          (p) => groupOf(statusByKey[`${eventId}:${p.id}`]) === group.key
        );
        if (members.length === 0) return null;

        return (
          <div key={group.key} className="flex flex-col gap-1.5">
            <p
              className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${group.headerClass}`}
            >
              <group.Icon className="h-3.5 w-3.5 shrink-0" />
              {group.label} ({members.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {members.map((p) => {
                const reason = reasonByKey[`${eventId}:${p.id}`];
                return (
                  <span
                    key={p.id}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${group.badgeClass}`}
                  >
                    <span className="font-bold">{formatLastName(p.last_name) || "—"}</span>
                    {formatFirstName(p.first_name)}
                    {/* Le motif n'apparaît que sur une absence renseignée :
                        c'est l'information qui décide d'un remplacement. */}
                    {group.key === "ABSENT" && reason && (
                      <span className="font-normal opacity-80">— {reason}</span>
                    )}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
