// Audit du 30/08 : sur les dizaines de requêtes Supabase de l'appli, la
// quasi-totalité ignorait son erreur (data ?? [] masquait tout échec en
// silence) — à l'origine du bug des présences trouvé le même jour
// (fetchRsvpsByEvent, dashboard/page.tsx). Plutôt qu'un
// `if (xxxRes.error) console.error(...)` répété à chaque site d'appel, un
// seul point de passage après chaque groupe de requêtes parties ensemble
// (Promise.all/runBatched) — journalise dans les logs Vercel, ne change
// jamais le comportement pour l'utilisateur (data ?? [] reste le repli),
// juste rend visible ce qui était muet. Partagé entre dashboard/page.tsx
// et enfant/view/page.tsx plutôt que dupliqué (même besoin exact).
export function logQueryErrors(
  context: string,
  results: Record<string, { error: unknown } | null | undefined>
) {
  Object.entries(results).forEach(([name, res]) => {
    if (res?.error) {
      console.error(`[${context}] ${name} failed:`, res.error);
    }
  });
}
