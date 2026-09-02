// Canonical teams intentionally have name === category (see migration
// 20260812000000_teams_rename_canonical.sql) so every view shows the same
// wording — but that means naively concatenating "{name} · {category}"
// prints "U13F · U13F". Only join the two when they actually differ.
export function teamLabel(t: { name?: string | null; category?: string | null }): string {
  // "" est traité comme absent, pas comme un nom valide — sinon
  // teamLabel({ name: "", category: "U13F" }) renvoyait une étiquette
  // vide au lieu de retomber sur "U13F" (?? ne réagit qu'à null/undefined,
  // pas à une chaîne vide).
  const name = t.name || null;
  const category = t.category || null;
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

// Clé de catégorie d'une équipe, débarrassée du numéro de sous-groupe. Le
// club nomme ses équipes de façons très variées ("U13M-1", "U13M2",
// "U18 1", "Seniors G1 /RM3", "Séniors M") : découper sur le dernier
// chiffre ne suffit pas, sinon "U13" perdrait le sien. Utilisée à la fois
// par team-card.tsx (bouton "Affecter à une autre équipe") et
// member-detail-modal.tsx (fiche Membres, retour de Cindy du 02/09) — un
// seul découpage plutôt que deux copies qui pourraient diverger.
export function categoryKey(label: string | null | undefined) {
  if (!label) return "";
  const raw = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();

  // Catégories d'âge : U + âge + genre éventuel + numéro de groupe
  // éventuel. "U13M-1" et "U13M2" donnent "U13M", "U18 1" donne "U18",
  // et "U09" rejoint "U9".
  const youth = raw.replace(/[^A-Z0-9]/g, "").match(/^U(\d{1,2})([A-Z]*)\d*$/);
  if (youth) return `U${Number(youth[1])}${youth[2]}`;

  // Le reste : on écarte les marqueurs de groupe et de niveau ("1", "G2",
  // "RM3") et on garde ce qui nomme la catégorie ("SENIORS M" -> SENIORSM,
  // "Seniors G1 /RM3" -> SENIORS).
  return raw
    .split(/[^A-Z0-9]+/)
    .filter((token) => token && !/^(?:G|RM|RF|PR|D)?\d+$/.test(token))
    .join("");
}

// Un U13M ne peut être prêté qu'à un autre groupe U13M : proposer U15M ou
// U13F n'a aucun sens sportif. La comparaison est bidirectionnelle pour que
// l'équipe de base ("U13") et ses déclinaisons ("U13M-1") se reconnaissent
// mutuellement, sans pour autant rapprocher U13M et U13F.
export function sameCategoryFamily(a: string | null | undefined, b: string | null | undefined) {
  const ka = categoryKey(a);
  const kb = categoryKey(b);
  if (!ka || !kb) return true; // catégorie inconnue : ne rien masquer
  return ka.startsWith(kb) || kb.startsWith(ka);
}

// Le nom porte le niveau ("U13M-1"), la catégorie souvent le seul tronc
// commun ("U13") : c'est le nom qui discrimine, la catégorie ne sert que
// de repli quand il manque.
export function teamCategoryLabel(t: { name: string | null; category: string | null }) {
  return t.name ?? t.category;
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
