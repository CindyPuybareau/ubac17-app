import { computePlayerYearStatus, type PlayerYearStatus } from "@/lib/season";

// Shared across the Bureau's Membres table, the Coach/Bureau roster
// table, and the family's team roster — same computation, same visual
// language everywhere a player's année/statut needs to show up. All four
// variants share one soft-pastel-with-border family (see CLAUDE.md badge
// harmonization pass) so none of them reads as a jarring one-off, and
// `justify-center leading-none` keeps icon-less text badges perfectly
// centered regardless of the surrounding row's line-height.
const BADGE_BASE =
  "inline-flex w-fit items-center justify-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium leading-none";

// Rendu pur, séparé du calcul (retour de Cindy du 2026-08-25, bug
// "Sparring Partner" sur tous les joueurs de l'Espace Enfant) : la vraie
// date de naissance n'est jamais envoyée au navigateur d'un enfant (voir
// enfant/view/page.tsx, birthDate volontairement neutralisée à l'année
// 2000 pour la confidentialité) — computePlayerYearStatus() y donnait donc
// systématiquement le même résultat faux pour tout le monde. Le statut y
// est maintenant calculé côté serveur, avec la vraie date, puis seul ce
// composant de rendu (sans aucune date) est utilisé côté client.
export function PlayerYearStatusBadge({ status }: { status: PlayerYearStatus | null }) {
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
    // Kept distinct from Sparring Partner's purple so the two never look
    // alike at a glance. Label stays "Old Soldier" (title case, not
    // ALL CAPS) per Cindy's request.
    return (
      <span className={`${BADGE_BASE} border-slate-200 bg-slate-100 text-slate-700`}>
        Old Soldier
      </span>
    );
  }

  return (
    <span className={`${BADGE_BASE} border-sky-200/60 bg-sky-50 text-sky-700`}>
      {status.label}
    </span>
  );
}

export default function PlayerYearBadge({
  birthDate,
  category,
}: {
  birthDate: string | null;
  category: string | null;
}) {
  const status = computePlayerYearStatus(birthDate, category);
  return <PlayerYearStatusBadge status={status} />;
}
