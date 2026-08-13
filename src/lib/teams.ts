// Canonical teams intentionally have name === category (see migration
// 20260812000000_teams_rename_canonical.sql) so every view shows the same
// wording — but that means naively concatenating "{name} · {category}"
// prints "U13F · U13F". Only join the two when they actually differ.
export function teamLabel(t: { name?: string | null; category?: string | null }): string {
  const name = t.name ?? null;
  const category = t.category ?? null;
  if (name && category && name !== category) return `${name} · ${category}`;
  return name ?? category ?? "Équipe";
}

// Sépare "U13M-1" en groupe "U13M" et déclinaison 1. Le club écrit ses
// sous-équipes des deux façons — "U13M-1" et "U13M1" — donc les deux sont
// reconnues. Sans séparateur, le chiffre ne compte comme déclinaison que
// s'il suit une lettre : autrement "U13" deviendrait "U1" et "U11" "U1",
// et chaque catégorie perdrait son propre numéro.
function splitTeamName(label: string) {
  const trimmed = label.trim();
  const separated = trimmed.match(/^(.*?)[\s_-]+(\d+)$/);
  if (separated) return { group: separated[1].trim().toUpperCase(), rank: Number(separated[2]) };
  // Version collée ("U13M1"). Le groupe obtenu doit déjà contenir un
  // chiffre, sinon "U13" se lirait comme la déclinaison 13 du groupe "U"
  // et U09/U11/U13 se retrouveraient dans la même famille.
  const glued = trimmed.match(/^(.*?[A-Za-zÀ-ÿ])(\d+)$/);
  if (glued && /\d/.test(glued[1])) {
    return { group: glued[1].trim().toUpperCase(), rank: Number(glued[2]) };
  }
  // Pas de suffixe : c'est l'équipe mère, elle passe avant ses déclinaisons.
  return { group: trimmed.toUpperCase(), rank: 0 };
}

// Range chaque famille d'équipes dans l'ordre attendu — U13M avant U13M-1
// avant U13M-2 — sans bousculer l'ordre du club entre familles : chacune
// garde la position de sa première apparition. Trier tout alphabétiquement
// mettrait les Séniors avant les U13, ce que le club ne veut pas.
export function sortTeamsByGroup<T extends { name?: string | null; category?: string | null }>(
  teams: T[]
): T[] {
  const nameOf = (t: T) => t.name ?? t.category ?? "";
  const groupOrder = new Map<string, number>();
  teams.forEach((t) => {
    const { group } = splitTeamName(nameOf(t));
    if (!groupOrder.has(group)) groupOrder.set(group, groupOrder.size);
  });

  return [...teams].sort((a, b) => {
    const sa = splitTeamName(nameOf(a));
    const sb = splitTeamName(nameOf(b));
    const ga = groupOrder.get(sa.group) ?? 0;
    const gb = groupOrder.get(sb.group) ?? 0;
    if (ga !== gb) return ga - gb;
    return sa.rank - sb.rank;
  });
}
