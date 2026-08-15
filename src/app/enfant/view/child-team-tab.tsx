import { ShieldCheck, Users } from "lucide-react";
import { formatFirstName, formatPersonName } from "@/lib/names";
import type { ChildCoach, ChildEvent, ChildTeammate } from "./child-dashboard";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  PRESENT: { label: "Présent", className: "bg-emerald-100 text-emerald-700" },
  LATE: { label: "En retard", className: "bg-amber-100 text-amber-700" },
  ABSENT: { label: "Absent", className: "bg-red-100 text-red-700" },
  PENDING: { label: "En attente", className: "bg-zinc-100 text-zinc-500" },
};

// Avatar générique (initiale + couleur dérivée du nom) : aucune photo
// n'existe dans l'appli, et il n'y a aucune raison d'en ajouter une rien
// que pour cet écran — un rond coloré fait le même travail visuel.
const AVATAR_COLORS = [
  "bg-ubac-blue",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-teal-500",
];

function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function ChildTeamTab({
  teammates,
  coaches,
  nextEvent,
  nextEventAttendance,
}: {
  teammates: ChildTeammate[];
  coaches: ChildCoach[];
  nextEvent: ChildEvent | null;
  nextEventAttendance: { name: string | null; status: string }[];
}) {
  const presentCount = nextEventAttendance.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;

  return (
    <div className="flex flex-col gap-5">
      {coaches.length > 0 && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            <ShieldCheck className="h-3.5 w-3.5 text-navy" />
            Coachs
          </p>
          <div className="flex flex-wrap gap-3">
            {coaches.map((c) => (
              <div key={c.id} className="flex items-center gap-2">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(c.id)}`}
                >
                  {(c.firstName ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-zinc-800">
                  {formatPersonName(c.firstName, c.lastName)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {nextEvent && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Présences au prochain rendez-vous
          </p>
          <p className="mb-3 text-sm text-zinc-500">
            <span className="font-bold text-navy">{presentCount}</span> présent
            {presentCount > 1 ? "s" : ""} sur {nextEventAttendance.length}
          </p>
          <div className="flex flex-col gap-1.5">
            {nextEventAttendance.map((a, i) => {
              const status = STATUS_LABELS[a.status] ?? STATUS_LABELS.PENDING;
              return (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-zinc-700">{formatFirstName(a.name)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <Users className="h-3.5 w-3.5 text-navy" />
          L&apos;équipe ({teammates.length})
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {teammates.map((t) => (
            <div key={t.id} className="flex flex-col items-center gap-1.5 rounded-xl bg-zinc-50 p-3 text-center">
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white ${avatarColor(t.id)}`}
              >
                {(t.firstName ?? "?").charAt(0).toUpperCase()}
              </span>
              <span className="text-sm font-semibold text-zinc-800">{formatFirstName(t.firstName)}</span>
              {(t.jerseyNumber != null || t.position) && (
                <span className="text-[11px] text-zinc-400">
                  {[t.jerseyNumber != null ? `N°${t.jerseyNumber}` : null, t.position].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
          ))}
          {teammates.length === 0 && (
            <p className="col-span-full text-sm text-zinc-500">Personne d&apos;autre dans l&apos;équipe pour le moment.</p>
          )}
        </div>
      </div>
    </div>
  );
}
