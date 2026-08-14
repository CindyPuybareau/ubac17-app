// Notification best-effort après création ou modification d'un événement.
// Réutilise tel quel le circuit déjà en place pour la relance de présence
// (VAPID + push_targets_for_event) : rien de nouveau côté serveur, juste un
// second appelant.
//
// Un échec d'envoi ne doit jamais faire échouer la création/modification
// elle-même — d'où le try/catch qui avale l'erreur, même motif que
// request-attendance-button.tsx.
export async function sendEventPush(eventId: string, title: string, body: string) {
  try {
    await fetch("/api/send-push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, title, body, url: "/dashboard" }),
    });
  } catch {
    // Silencieux volontairement.
  }
}
