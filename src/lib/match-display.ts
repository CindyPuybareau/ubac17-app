export type ParsedMatchTitle = {
  opponent: string;
  isHome: boolean | null;
};

// Event titles created by the FFBB sync / planning import are prefixed with
// "vs " (home) or "@ " (away) ahead of the opponent name. Manually created
// events have no such prefix, so isHome stays unknown (no badge shown).
export function parseMatchTitle(title: string | null): ParsedMatchTitle {
  if (!title) return { opponent: "Match", isHome: null };
  if (title.startsWith("@ ")) {
    return { opponent: title.slice(2).trim(), isHome: false };
  }
  if (title.startsWith("vs ")) {
    return { opponent: title.slice(3).trim(), isHome: true };
  }
  return { opponent: title, isHome: null };
}

// Centralise un repli déjà dupliqué à plusieurs endroits (salles.ts,
// week-strip-banner.tsx, child-calendar-tab.tsx) : la colonne events.is_home
// n'est JAMAIS renseignée par la synchro FFBB (seul le texte "vs "/"@ " du
// titre l'encode, voir ffbb-sync.ts) -- sans ce repli, la quasi-totalité
// des vrais matchs perdrait tout statut Domicile/Extérieur. `isHome` est
// optionnel : un appelant qui n'a pas la colonne en base (ex. popups
// légères) peut appeler avec seulement un titre.
//
// Dernier repli sur `salle` (retour de Cindy du 19/10, cas "Coupe 17" --
// un événement créé à la main sans "vs "/"@ " dans son titre ET sans le
// sélecteur Domicile/Extérieur coché) : `salle` ne peut valoir qu'une des
// 3 salles DU CLUB (menu déroulant fermé, create-event-form.tsx) -- en
// choisir une veut donc TOUJOURS dire "chez nous", jamais l'inverse. Ce
// repli n'intervient qu'en dernier recours, quand ni la colonne is_home ni
// le titre ne disent rien : un match synchronisé FFBB est TOUJOURS déjà
// résolu par son titre avant d'arriver ici (vs/@ posé par la synchro,
// jamais null), donc n'atteint jamais cette ligne -- aucun risque de
// réécrire "Extérieur" sur l'un des 30 matchs à domicile encore sans salle
// renseignée.
export function resolveIsHome(event: {
  isHome?: boolean | null;
  title: string | null;
  salle?: string | null;
}): boolean | null {
  const known = event.isHome ?? parseMatchTitle(event.title).isHome;
  if (known !== null) return known;
  if (event.salle !== undefined) return Boolean(event.salle);
  return null;
}

export function opponentInitials(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}
