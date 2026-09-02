// Limite le nombre de requêtes Supabase strictement simultanées.
//
// Contexte (audit du 2026-08-25, "latence croissante sur /dashboard") : le
// projet Supabase (offre "Nano") n'autorise que 15 connexions PostgreSQL
// réelles en même temps. page.tsx charge ses données par gros blocs
// (Bureau/Coach/Famille) eux-mêmes lancés en parallèle (retour de Cindy du
// 2026-08-22, "chargement de ton espace trop lent" pour un compte qui
// cumule plusieurs rôles) — et CHAQUE bloc envoyait toutes ses requêtes
// (jusqu'à 16 pour le seul bloc Bureau) d'un coup via Promise.all(). Un
// compte multi-rôles pouvait donc déclencher 30 à 50 requêtes strictement
// simultanées en une seule visite, largement au-dessus des 15 connexions
// disponibles — d'où le ralentissement qui s'aggrave à chaque rechargement
// rapproché (les requêtes en trop font la queue).
//
// runBatched garde le bénéfice du parallélisme (dès qu'une requête se
// termine, la suivante démarre aussitôt — pas d'attente de "lot" complet
// comme un découpage en tranches fixes le ferait) tout en plafonnant le
// nombre de requêtes en vol à `limit`. Signature calquée sur Promise.all
// (même ordre de résultats, même inférence de tuple) pour rester une
// simple substitution là où Promise.all était utilisé.
// Signature calquée sur celle, native, de Promise.all (chaque tâche peut
// renvoyer une valeur directe ou un "thenable" — c'est le cas des requêtes
// Supabase, qui ne sont des Promise qu'au sens PromiseLike/.then(), pas
// littéralement — d'où Awaited<T[K]> plutôt que Promise<T[K]> ici, sans
// quoi TypeScript n'arrive plus à déduire le type de chaque résultat et
// tout retombe silencieusement en `unknown`).
// Découpe un tableau d'ids en tranches assez petites pour tenir dans une
// URL — utilisé pour remplacer les .in("event_id", eventIds) qui, avec
// TOUT l'historique du club (800+ événements dès fin août), produisaient
// une URL trop longue et une requête rejetée par Supabase.
//
// Retour du 02/09 : le contournement posé le 30/08 pour ce même bug
// (getVolunteerNeedsByEventId, fetchRsvpsByEvent, getEventTasksByEventId,
// getCarpoolOffersByEventId) supprimait purement et simplement le filtre
// .in() — un fetch de la table ENTIÈRE, filtré ensuite en mémoire. Ça
// marchait, mais un scan complet devient plus lent à chaque événement
// ajouté ; ce matin, Postgres a fini par annuler ces requêtes lui-même
// ("canceling statement due to statement timeout", erreur 500 sur
// /dashboard). chunkIds() permet de garder un vrai .in() — donc une
// lecture indexée, rapide, qui ne grossit pas avec l'historique — tout en
// restant sous la limite de taille d'URL grâce à plusieurs requêtes plus
// petites (parties en parallèle par l'appelant).
export function chunkIds(ids: string[], size = 150): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

// Exécute une requête .in(colonne, ids) découpée en tranches (chunkIds
// ci-dessus), tranches parties en parallèle mais PLAFONNÉES (comme
// runBatched) plutôt que toutes d'un coup — retour de Cindy du 02/09
// (deuxième incident le même jour, "mes membres ont disparu") : un plein
// Promise.all() sur toutes les tranches à la fois ajoutait sa propre
// pointe de connexions simultanées à celles déjà en vol pour les blocs
// Bureau/Coach/Famille (parallélisés entre eux depuis le 22/08) — assez
// pour dépasser les 15 connexions disponibles à elle seule, même pour un
// seul utilisateur, et faire annuler une requête par Postgres
// ("statement timeout"), ce qui a ensuite fait échouer en cascade toutes
// les autres requêtes de la même transaction (dont celle des Membres).
// Fusionne aussi les résultats et les erreurs de chaque tranche, pour ne
// pas répéter cette boucle aux 4 mêmes endroits (fetchRsvpsByEvent,
// getVolunteerNeedsByEventId, getEventTasksByEventId,
// getCarpoolOffersByEventId).
export async function chunkedQuery<T>(
  ids: string[],
  size: number,
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  concurrency = 4
): Promise<{ data: T[]; errors: unknown[] }> {
  const chunks = chunkIds(ids, size);
  const results = await runBatched(
    chunks.map((chunk) => () => run(chunk)),
    concurrency
  );
  const data: T[] = [];
  const errors: unknown[] = [];
  results.forEach((res) => {
    if (res.error) {
      errors.push(res.error);
      return;
    }
    data.push(...(res.data ?? []));
  });
  return { data, errors };
}

export async function runBatched<T extends readonly unknown[]>(
  tasks: { [K in keyof T]: () => T[K] | PromiseLike<T[K]> },
  limit: number
): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
  const results: unknown[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const current = nextIndex++;
      results[current] = await tasks[current]();
    }
  }

  const workerCount = Math.max(1, Math.min(limit, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results as { [K in keyof T]: Awaited<T[K]> };
}
