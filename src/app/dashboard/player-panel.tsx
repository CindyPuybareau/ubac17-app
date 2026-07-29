import { CalendarDays, CheckCircle2 } from "lucide-react";

export default function PlayerPanel({
  name,
  category,
}: {
  name: string;
  category?: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ubac-yellow/20 text-ubac-yellow-dark">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-semibold text-zinc-900">Calendrier</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Les prochains matchs et entraînements de {name}
            {category ? ` (${category})` : ""} arriveront bientôt ici.
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
  );
}
