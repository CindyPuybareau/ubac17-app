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
// et chaque catégorie perdrait son propre numéro. Exportée (retour de
// Cindy du 11/09) pour groupTeamsByPrimarySecondary ci-dessous : même
// découpage plutôt qu'une deuxième copie.
export function splitTeamName(label: string) {
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

// Un U13M ne peut être affecté qu'à un autre groupe U13M : proposer U15M ou
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
  return t.name ?? cleanRawCategory(t.category);
}

// Retour de Cindy du 07/09 ("elle n'est pas renommée" -- fiche Membres,
// "z.Sénior" affiché) : quand ni équipe ni nom ne sont connus (joueur
// jamais affecté à aucune équipe, cas de Julien RUSKE), teamCategoryLabel
// retombe sur players.category -- un texte figé à l'import, jamais
// retouché depuis. Pour les Séniors uniquement, ce texte porte un préfixe
// "z." purement technique (utilisé pour trier les Séniors en dernier dans
// les listes alphabétiques, voir suggestTeamCategory) -- jamais pensé pour
// être affiché tel quel. Nettoyé ici, au point d'entrée unique de toute
// catégorie brute affichée en dernier recours.
function cleanRawCategory(category: string | null): string | null {
  if (!category) return category;
  return category.replace(/^z\./i, "");
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

// Retour de Cindy du 11/09 ("équipe principale" U13M/U18M/Séniors M avec
// ses "équipes secondaires" U13M-1+U13M-2/U18M-1+U18M-2/Séniors 1+2) :
// fusionne les calendriers d'une personne UNIQUEMENT quand elle a le tag
// de l'équipe principale (rang 0, "U13M") ET au moins un tag d'équipe
// secondaire (rang > 0, "U13M-1") du MÊME groupe -- jamais entre deux
// secondaires sans la principale (ex. U13M-1 + U13M-2 sans U13M restent
// séparées, comme demandé explicitement). Générique par construction
// (splitTeamName lit le nom, pas une liste de catégories codée en dur) :
// toute future équipe suivant ce même principe (mère sans suffixe +
// déclinaisons numérotées) en bénéficie automatiquement, sans modification
// de code. `teams` est la liste des équipes d'UNE SEULE personne (ses
// propres team_players, coachées ou jouées selon l'espace appelant) --
// jamais le catalogue du club entier, qui mélangerait des personnes
// différentes.
export function groupTeamsByPrimarySecondary<
  T extends { id: string; name?: string | null; category?: string | null },
>(teams: T[]): { primary: T; secondaries: T[] }[] {
  const byGroup = new Map<string, { rank: number; team: T }[]>();
  teams.forEach((t) => {
    const label = t.name ?? t.category ?? "";
    const { group, rank } = splitTeamName(label);
    (byGroup.get(group) ?? byGroup.set(group, []).get(group)!).push({ rank, team: t });
  });

  const merged: T[] = [];
  const secondariesByPrimaryId = new Map<string, T[]>();
  const consumedIds = new Set<string>();

  byGroup.forEach((entries) => {
    const primaryEntry = entries.find((e) => e.rank === 0);
    const secondaryEntries = entries.filter((e) => e.rank > 0);
    if (primaryEntry && secondaryEntries.length > 0) {
      merged.push(primaryEntry.team);
      secondariesByPrimaryId.set(
        primaryEntry.team.id,
        secondaryEntries.map((e) => e.team)
      );
      consumedIds.add(primaryEntry.team.id);
      secondaryEntries.forEach((e) => consumedIds.add(e.team.id));
    }
  });

  // Tout ce qui n'a pas été absorbé par une fusion (équipe sans famille,
  // ou groupe avec seulement des secondaires sans principale) reste tel
  // quel, un onglet par équipe -- exactement le comportement actuel.
  teams.forEach((t) => {
    if (!consumedIds.has(t.id)) merged.push(t);
  });

  return sortTeamsByGroup(merged).map((t) => ({
    primary: t,
    secondaries: secondariesByPrimaryId.get(t.id) ?? [],
  }));
}

// Retour de Cindy du 21/09 ("jamais un match officiel ou résultats
// n'apparaîtra chez les U13M ni les U18M ni les Séniors M -- les
// concernées sont toujours les déclinaisons, U13M-1/U13M-2, Séniors
// 1/Séniors 2") : contrairement au Calendrier (où fusionner mère +
// déclinaisons en un seul onglet a du sens -- un entraînement peut être
// commun), les vues Matchs officiels/Résultats n'ont rien à faire d'un
// onglet pour une mère qui, dans les faits, ne joue jamais elle-même. Une
// catégorie non scindée (ex. "U13F", pas de "-1"/"-2") garde son propre
// onglet, elle -- elle joue directement sous son nom.
// Constaté en test réel du 21/09 : "Séniors M" restait affichée à côté de
// "Séniors 1"/"Séniors 2" -- groupTeamsByPrimarySecondary (texte exact)
// ne les voit PAS comme le même groupe, contrairement à "U13M"/"U13M-1"
// (le "M" du genre est répété dans les DEUX cas pour U13M, mais retiré
// des déclinaisons côté Séniors -- "Séniors 1", pas "Séniors M-1"). Repli
// ici sur une clé plus tolérante (numéro de déclinaison ET lettre de
// genre finale retirés) plutôt que de toucher splitTeamName/
// groupTeamsByPrimarySecondary eux-mêmes, utilisés ailleurs (Calendrier)
// où ce cas n'a jamais été signalé comme un problème.
function looseFamilyKey(label: string): string {
  return label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[\s_-]*\d+$/, "")
    .replace(/\s+[MF]$/, "")
    .trim();
}

export function listTeamsForOfficialMatches<
  T extends { id: string; name?: string | null; category?: string | null },
>(teams: T[]): T[] {
  const withRank = teams.map((t) => {
    const label = t.name ?? t.category ?? "";
    return { team: t, base: looseFamilyKey(label), rank: splitTeamName(label).rank };
  });
  const basesWithDeclinaison = new Set(
    withRank.filter((e) => e.rank > 0).map((e) => e.base)
  );
  return withRank
    .filter((e) => e.rank > 0 || !basesWithDeclinaison.has(e.base))
    .map((e) => e.team);
}

// Retour de Cindy du 30/09 ("équipes sœurs", U13M-1↔U13M-2, Séniors
// 1↔Séniors 2...) : à partir d'une équipe précise, renvoie les ids de ses
// vraies déclinaisons sœurs numérotées dans le catalogue COMPLET passé en
// `allTeams` -- jamais l'équipe mère (rank 0, "U13M" elle-même), jamais une
// catégorie sans rapport. Même repli `looseFamilyKey` que
// `listTeamsForOfficialMatches` juste au-dessus (le "M" du genre est retiré
// des déclinaisons côté Séniors, "Séniors 1" pas "Séniors M-1") plutôt que
// `sameCategoryFamily`/`categoryKey` (pensés pour la réaffectation
// manuelle, volontairement permissifs -- une catégorie inconnue "ne masque
// rien" là-bas, ce qui donnerait ici de fausses sœurs). Une équipe sans
// suffixe numéroté (rank 0, ex. "U13F" jouant directement sous son nom)
// n'a par construction aucune sœur.
export function getSiblingTeamIds<
  T extends { id: string; name?: string | null; category?: string | null },
>(team: T, allTeams: T[]): string[] {
  const label = team.name ?? team.category ?? "";
  const { rank } = splitTeamName(label);
  if (rank === 0) return [];
  const base = looseFamilyKey(label);
  return allTeams
    .filter((t) => t.id !== team.id)
    .filter((t) => {
      const tLabel = t.name ?? t.category ?? "";
      const tSplit = splitTeamName(tLabel);
      return tSplit.rank > 0 && looseFamilyKey(tLabel) === base;
    })
    .map((t) => t.id);
}

// Retour de Cindy du 30/09, précisé le même jour ("en équipe 2, il n'y a
// jamais de brûlé") : le statut ne peut vivre QUE sur la déclinaison la
// plus petite d'une paire sœur (ex. U13M-1, jamais U13M-2) -- un joueur de
// la "2" n'a personne contre qui être brûlé, la règle n'a de sens que dans
// ce sens-là. Sert à la fois à décider si la case doit s'afficher et à
// choisir la bonne ligne team_players à écrire (member-detail-modal.tsx).
export function isLowestRankSiblingTeam<
  T extends { id: string; name?: string | null; category?: string | null },
>(team: T, allTeams: T[]): boolean {
  const label = team.name ?? team.category ?? "";
  const { rank } = splitTeamName(label);
  if (rank === 0) return false;
  const siblingIds = getSiblingTeamIds(team, allTeams);
  if (siblingIds.length === 0) return false;
  const siblingRanks = allTeams
    .filter((t) => siblingIds.includes(t.id))
    .map((t) => splitTeamName(t.name ?? t.category ?? "").rank);
  return siblingRanks.every((r) => rank < r);
}

// Retour de Cindy du 30/09 ("pour les U18M seulement") : contrairement aux
// autres paires sœurs (U13M-1/U13M-2, Séniors 1/Séniors 2...), en
// consultation seule, U18M-1 et U18M-2 partagent en pratique le même groupe
// de joueurs -- n'importe quel joueur U18M doit pouvoir se déclarer
// présent/absent sur les matchs officiels/amicaux des DEUX déclinaisons, et
// un coach de l'une gère aussi l'autre comme la sienne. Restreint
// explicitement à "U18M" (looseFamilyKey) -- jamais étendu à une autre
// catégorie sans demande explicite de Cindy (pas une règle générale des
// équipes sœurs).
export function isSharedRsvpTeamGroup(label: string): boolean {
  return looseFamilyKey(label) === "U18M";
}

// Élargit les ids d'équipe d'UN joueur à tout le groupe U18M
// (isSharedRsvpTeamGroup ci-dessus) -- utilisée là où "les équipes de ce
// joueur" pilote à la fois l'éligibilité au bouton Présent/Absent
// (respondingPlayers, calendar-view.tsx) ET le bilan de présence personnel
// (computeSeasonParticipation, season-bilan.ts, qui lit ce même tableau) :
// un seul élargissement à la source profite aux deux sans dupliquer la
// règle. N'importe quelle autre catégorie ressort inchangée.
// Vérifié en base le 30/09 : les 22 joueurs U18M sont TOUS inscrits sur
// l'équipe mère "U18M" (rank 0) -- U18M-1/U18M-2 n'ont aucun effectif
// propre, elles ne portent que les matchs FFBB. getSiblingTeamIds (rang>0
// à rang>0 seulement, exclut la mère par construction) ne suffit donc pas
// ici : il faut tout le groupe famille (looseFamilyKey), mère incluse.
export function widenTeamIdsForSharedRsvpGroups<
  T extends { id: string; name?: string | null; category?: string | null },
>(teamIds: string[], allTeams: T[]): string[] {
  const widened = new Set(teamIds);
  teamIds.forEach((id) => {
    const team = allTeams.find((t) => t.id === id);
    if (!team) return;
    const label = team.name ?? team.category ?? "";
    if (!isSharedRsvpTeamGroup(label)) return;
    const base = looseFamilyKey(label);
    allTeams
      .filter((t) => t.id !== id)
      .filter((t) => {
        const tLabel = t.name ?? t.category ?? "";
        return isSharedRsvpTeamGroup(tLabel) && looseFamilyKey(tLabel) === base;
      })
      .forEach((t) => widened.add(t.id));
  });
  return Array.from(widened);
}
