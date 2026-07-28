import { CalendarDays, CheckCircle2 } from "lucide-react";

export default function MemberView() {
  return (
    <div className="flex flex-col gap-4">
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ubac-yellow/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ubac-yellow-dark">
        Espace Membre
      </span>
      <p className="text-sm text-zinc-500">
        Le calendrier et les convocations à venir.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ubac-yellow/20 text-ubac-yellow-dark">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-semibold text-zinc-900">Calendrier</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Les prochains matchs et entraînements arriveront bientôt ici.
            </p>
          </div>
        </div>
        <div className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ubac-yellow/20 text-ubac-yellow-dark">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-semibold text-zinc-900">Convocations</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Réponds Présent, Absent ou Retard directement depuis ici.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
