// "Combien de personnes accompagnent ?" (retour de Cindy du 19/11, question
// du comptable pour le Noël de l'UBAC) : un seul nombre, PAR FAMILLE, sur
// un Événement club dont le Bureau a coché la case (events.ask_companions).
//
// Le nombre vit sur la réponse "Présent" de chaque licencié (rsvps.companions).
// Les deux parents modifient la même réponse : jamais de doublon entre eux.
// Entre frères et sœurs, l'appli recopie le même nombre sur chaque enfant
// présent -- et le total ne le compte qu'UNE fois par famille (le plus grand
// des nombres déclarés), même si un coach a répondu pour un seul enfant.
// Module pur : utilisé par la page serveur et par les composants client.

export const MAX_COMPANIONS = 10;

// Familles = licenciés qui partagent au moins un parent dans l'appli
// (parent_player), regroupés de proche en proche. Un licencié sans parent
// rattaché (adulte inscrit lui-même) forme sa propre famille.
export function groupByFamily(
  playerIds: string[],
  parentLinks: { parent_id: string; player_id: string }[]
): string[][] {
  const root = new Map<string, string>(playerIds.map((id) => [id, id]));
  const find = (id: string): string => {
    let r = id;
    while (root.get(r) !== r) r = root.get(r) as string;
    root.set(id, r);
    return r;
  };
  const firstPlayerByParent = new Map<string, string>();
  parentLinks.forEach(({ parent_id, player_id }) => {
    if (!root.has(player_id)) return;
    const other = firstPlayerByParent.get(parent_id);
    if (!other) {
      firstPlayerByParent.set(parent_id, player_id);
      return;
    }
    const a = find(other);
    const b = find(player_id);
    if (a !== b) root.set(b, a);
  });
  const groups = new Map<string, string[]>();
  playerIds.forEach((id) => {
    const family = find(id);
    groups.set(family, [...(groups.get(family) ?? []), id]);
  });
  return Array.from(groups.values());
}

// Total des accompagnants : le plus grand nombre déclaré dans chaque
// famille, une seule fois par famille.
export function familyCompanionsTotal(
  companionsByPlayerId: Record<string, number>,
  parentLinks: { parent_id: string; player_id: string }[]
): number {
  return groupByFamily(Object.keys(companionsByPlayerId), parentLinks).reduce(
    (total, ids) => total + Math.max(0, ...ids.map((id) => companionsByPlayerId[id] ?? 0)),
    0
  );
}

// Détail pour le Bureau et l'export du comptable : une ligne par famille
// présente (licenciés présents + accompagnants).
export type CompanionsFamilyLine = { names: string[]; teams: string[]; present: number; companions: number };
