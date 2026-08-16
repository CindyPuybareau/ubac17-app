import type { ReactNode } from "react";
import { Dumbbell, Trophy } from "lucide-react";
import type { ChildAttendanceStats } from "./child-dashboard";

// Remplace l'ancien onglet "Défis" (badges à débloquer, jugé trop
// enfantin) : deux vrais compteurs d'assiduité, calculés côté serveur à
// partir des RSVP passés de l'enfant (page.tsx) — mêmes données que
// l'ancien badge "Assidu", juste présentées comme un bilan plutôt qu'un
// jeu.
export default function ChildPresenceTab({
  trainings,
  matches,
}: {
  trainings: ChildAttendanceStats;
  matches: ChildAttendanceStats;
}) {
  return (
    <div className="flex flex-col gap-4">
      <StatCard
        icon={<Dumbbell className="h-5 w-5" />}
        label="Présence aux entraînements"
        stats={trainings}
        emptyLabel="Aucun entraînement passé pour le moment."
      />
      <StatCard
        icon={<Trophy className="h-5 w-5" />}
        label="Présence aux matchs"
        stats={matches}
        emptyLabel="Aucun match passé pour le moment."
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  stats,
  emptyLabel,
}: {
  icon: ReactNode;
  label: string;
  stats: ChildAttendanceStats;
  emptyLabel: string;
}) {
  const pct = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : null;

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ubac-yellow/20 text-ubac-yellow-dark">
          {icon}
        </span>
        {label}
      </p>

      {stats.total === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">{emptyLabel}</p>
      ) : (
        <>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-bold text-navy">{stats.present}</span>
            <span className="text-lg font-semibold text-zinc-400">/{stats.total} séances</span>
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-ubac-yellow-dark transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">{pct}% de présence</p>
        </>
      )}
    </div>
  );
}
