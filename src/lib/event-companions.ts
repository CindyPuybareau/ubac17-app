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
export function familyCompanionsTotal(
  companionsByPlayerId: Record<string, number>,
  parentLinks: { parent_id: string; player_id: string }[]
): number {
  const playerIds = Object.keys(companionsByPlayerId);
  if (playerIds.length === 0) return 0;

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

  const maxByFamily = new Map<string, number>();
  playerIds.forEach((id) => {
    const family = find(id);
    maxByFamily.set(family, Math.max(maxByFamily.get(family) ?? 0, companionsByPlayerId[id] ?? 0));
  });
  let total = 0;
  maxByFamily.forEach((n) => (total += n));
  return total;
}
