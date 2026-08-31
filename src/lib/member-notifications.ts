import type { SupabaseClient } from "@supabase/supabase-js";

// Notifications à l'arrivée d'un joueur (retour de Cindy du 31/08) :
// - Le Bureau, par email, à chaque nouvelle FICHE créée (un ajout au coup
//   par coup — "Ajouter un membre", création directe depuis une équipe,
//   ou le futur formulaire branché — jamais l'import Excel groupé, qui
//   ferait un email par ligne d'un coup à la rentrée : le résumé déjà
//   affiché à l'écran pendant cet import suffit).
// - Les coachs concernés, dans l'appli (la cloche déjà utilisée pour les
//   rappels de match), à chaque fois qu'un joueur est AFFECTÉ à leur
//   équipe — peu importe la source (ajout, import, formulaire), puisque
//   c'est le moment qui compte vraiment pour un coach.
//
// Best-effort, jamais bloquant : un échec ici ne doit jamais empêcher
// l'action réelle (créer le membre, l'affecter à une équipe) de réussir —
// même principe que l'historique de notification déjà posé pour les push
// (src/app/api/send-push/route.ts).

export async function notifyCoachesOfNewTeamMember(
  supabase: SupabaseClient,
  teamId: string,
  message: string
): Promise<void> {
  const { error } = await supabase.from("notifications").insert({
    team_id: teamId,
    title: "Nouveau joueur dans l'équipe",
    body: message,
    url: "/dashboard",
  });
  if (error) {
    console.error("[member-notifications] notification coach échouée:", error);
  }
}

// Wrapper client uniquement : sendEmail() est un module serveur
// (nodemailer/Resend), inutilisable depuis un composant "use client" —
// on passe donc par la route déjà utilisée pour les relances de
// cotisation plutôt que d'en créer une nouvelle.
export async function notifyBureauNewMemberFromClient(playerName: string): Promise<void> {
  try {
    const res = await fetch("/api/send-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: "ubac17.basket@gmail.com",
        subject: `UBAC — Nouveau membre : ${playerName}`,
        body: `Bonjour,\n\n${playerName} vient d'être ajouté(e) dans Membres.\n\nSportivement,\nL'appli UBAC`,
      }),
    });
    if (!res.ok) {
      console.error("[member-notifications] email nouveau membre échoué:", await res.text());
    }
  } catch (e) {
    console.error("[member-notifications] email nouveau membre échoué:", e);
  }
}
