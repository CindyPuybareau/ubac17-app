// Retour de Cindy du 17/09 ("je veux des push réels pour...") : petit
// relais client-safe vers /api/send-team-push -- push-targets.ts (server
// only, importe web-push) planterait si importé depuis un composant
// "use client". Best-effort, jamais bloquant : un échec ici ne doit jamais
// remettre en cause l'action réelle déjà faite (créer/relancer un besoin,
// affecter un joueur...), même principe que la cloche elle-même.
export async function sendTeamPush(params: {
  audience?: "TEAM" | "BUREAU" | "PLAYER";
  teamId?: string | null;
  targetTeamIds?: string[] | null;
  coachesOnly?: boolean;
  playerId?: string;
  title: string;
  body: string;
  url?: string;
}): Promise<void> {
  try {
    await fetch("/api/send-team-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch (e) {
    console.error("[push-notify-client] envoi push échoué:", e);
  }
}
