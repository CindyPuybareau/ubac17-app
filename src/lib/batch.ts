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
