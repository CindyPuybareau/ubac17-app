import { PartyPopper, Gift } from "lucide-react";
import { formatFirstName, formatLastName } from "@/lib/names";
import type { BirthdayEntry, BirthdaySource } from "./birthdays";

function dayLabel(daysUntil: number) {
  if (daysUntil === 0) return "Aujourd'hui !";
  if (daysUntil === 1) return "Demain";
  return `Dans ${daysUntil} j`;
}

export default function BirthdayWidget({
  entries,
}: {
  entries: BirthdayEntry<BirthdaySource>[];
}) {
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col rounded-2xl border border-pink-100 bg-pink-50/60 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <PartyPopper className="h-5 w-5 shrink-0 text-pink-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-pink-600">
          Anniversaires de la semaine
        </p>
      </div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {entries.map((e) => (
          <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium text-zinc-800">
              {formatFirstName(e.firstName) || "Membre"}{" "}
              <span className="font-bold uppercase">{formatLastName(e.lastName)}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-pink-600">
              <Gift className="h-3.5 w-3.5" />
              {dayLabel(e.daysUntil)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
