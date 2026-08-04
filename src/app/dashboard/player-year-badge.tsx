import { computePlayerYearStatus } from "@/lib/season";

// Shared across the Bureau's Membres table, the Coach/Bureau roster
// table, and the family's team roster — same computation, same visual
// language everywhere a player's année/statut needs to show up.
export default function PlayerYearBadge({
  birthDate,
  category,
}: {
  birthDate: string | null;
  category: string | null;
}) {
  const status = computePlayerYearStatus(birthDate, category);
  if (!status) return null;

  if (status.kind === "ROOKIE") {
    return (
      <span className="inline-flex w-fit items-center rounded-full bg-ubac-yellow/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ubac-yellow-dark">
        Rookie
      </span>
    );
  }

  if (status.kind === "SPARRING") {
    return (
      <span className="inline-flex w-fit items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
        Sparring Partner
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700">
      {status.label}
    </span>
  );
}
