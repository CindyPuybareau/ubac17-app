import { computePlayerYearStatus } from "@/lib/season";

// Shared across the Bureau's Membres table, the Coach/Bureau roster
// table, and the family's team roster — same computation, same visual
// language everywhere a player's année/statut needs to show up. All four
// variants share one soft-pastel-with-border family (see CLAUDE.md badge
// harmonization pass) so none of them reads as a jarring one-off, and
// `justify-center leading-none` keeps icon-less text badges perfectly
// centered regardless of the surrounding row's line-height.
const BADGE_BASE =
  "inline-flex w-fit items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium leading-none";

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
      <span className={`${BADGE_BASE} border-ubac-yellow/30 bg-ubac-yellow/10 text-ubac-yellow-dark`}>
        Rookie
      </span>
    );
  }

  if (status.kind === "SPARRING") {
    return (
      <span className={`${BADGE_BASE} border-purple-200/60 bg-purple-50 text-purple-700`}>
        Sparring Partner
      </span>
    );
  }

  if (status.kind === "OLD_SOLDIER") {
    // Named "Vétéran" in the UI (kept distinct from Sparring Partner's
    // purple so the two never look alike at a glance).
    return (
      <span className={`${BADGE_BASE} border-slate-200 bg-slate-100 text-slate-700`}>
        Vétéran
      </span>
    );
  }

  return (
    <span className={`${BADGE_BASE} border-sky-200/60 bg-sky-50 text-sky-700`}>
      {status.label}
    </span>
  );
}
