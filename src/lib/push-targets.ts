import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };

// Retour de Cindy du 17/09 ("je veux des push réels pour...") : extrait de
// l'ancien pushSubscriptionsForTeam (cron/match-reminders/route.ts, une
// seule équipe) et généralisé -- team_id/targetTeamIds tous deux null =
// tout le club (même convention que partout ailleurs dans l'appli), et
// coachesOnly pour "Nouveau joueur dans l'équipe" (jamais les
// parents/joueurs pour cette notification-là précise). Réservé à un appel
// server-side avec le client service_role (cron, ou une route qui a déjà
// vérifié elle-même qui a le droit d'envoyer) -- ne fait AUCUNE vérification
// d'autorisation ici, contrairement à push_targets_for_event/
// push_targets_for_team côté SQL, utilisées elles depuis un contexte
// authentifié classique.
export async function resolveTeamPushSubscriptions(
  supabase: SupabaseClient,
  params: {
    teamId: string | null;
    targetTeamIds: string[] | null;
    coachesOnly?: boolean;
  }
): Promise<PushSubscriptionRow[]> {
  const teamIds = params.teamId ? [params.teamId] : params.targetTeamIds;
  const profileIds = new Set<string>();

  if (!params.coachesOnly) {
    const rosterQuery = supabase.from("team_players").select("player_id");
    const { data: rosterRows } = teamIds
      ? await rosterQuery.in("team_id", teamIds)
      : await rosterQuery;
    const playerIds = Array.from(new Set((rosterRows ?? []).map((r) => r.player_id)));

    if (playerIds.length > 0) {
      const [parentRows, playerAccountRows] = await Promise.all([
        supabase.from("parent_player").select("parent_id").in("player_id", playerIds),
        supabase
          .from("players")
          .select("profile_id")
          .in("id", playerIds)
          .not("profile_id", "is", null),
      ]);
      (parentRows.data ?? []).forEach((r) => profileIds.add(r.parent_id));
      (playerAccountRows.data ?? []).forEach((r) => {
        if (r.profile_id) profileIds.add(r.profile_id);
      });
    }
  }

  const coachQuery = supabase.from("team_coaches").select("coach_id");
  const { data: coachRows } = teamIds ? await coachQuery.in("team_id", teamIds) : await coachQuery;
  (coachRows ?? []).forEach((r) => profileIds.add(r.coach_id));

  if (profileIds.size === 0) return [];

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("profile_id", Array.from(profileIds));

  return (subs ?? []) as PushSubscriptionRow[];
}

// Retour de Cindy du 17/09 : "Formulaire d'inscription" concerne le Bureau,
// jamais une équipe -- même correspondance email que bureauRoster
// (page.tsx) : club_administrators n'a pas de profile_id direct, seul un
// email en commun avec profiles permet de retrouver le compte à notifier.
export async function resolveBureauPushSubscriptions(
  supabase: SupabaseClient
): Promise<PushSubscriptionRow[]> {
  const { data: admins } = await supabase.from("club_administrators").select("email");
  const emails = new Set(
    (admins ?? []).map((a) => (a.email as string | null)?.toLowerCase()).filter((e): e is string => Boolean(e))
  );
  if (emails.size === 0) return [];

  const { data: profiles } = await supabase.from("profiles").select("id, email");
  const profileIds = (profiles ?? [])
    .filter((p) => emails.has((p.email as string | null)?.toLowerCase() ?? ""))
    .map((p) => p.id as string);
  if (profileIds.length === 0) return [];

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("profile_id", profileIds);

  return (subs ?? []) as PushSubscriptionRow[];
}

// Retour de Cindy du 17/09 ("Inscription à un covoiturage") : le
// destinataire est UNE personne précise (qui propose le trajet), jamais
// toute une équipe -- son propre compte (players.profile_id) si elle en a
// un, PLUS ses parents (parent_player), même logique que "qui gère les
// notifications de ce joueur" utilisée ailleurs dans l'appli.
export async function resolvePlayerPushSubscriptions(
  supabase: SupabaseClient,
  playerId: string
): Promise<PushSubscriptionRow[]> {
  const profileIds = new Set<string>();

  const [playerRow, parentRows] = await Promise.all([
    supabase.from("players").select("profile_id").eq("id", playerId).maybeSingle(),
    supabase.from("parent_player").select("parent_id").eq("player_id", playerId),
  ]);
  if (playerRow.data?.profile_id) profileIds.add(playerRow.data.profile_id as string);
  (parentRows.data ?? []).forEach((r) => profileIds.add(r.parent_id));

  if (profileIds.size === 0) return [];

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("profile_id", Array.from(profileIds));

  return (subs ?? []) as PushSubscriptionRow[];
}

// Retour de Cindy du 17/09 : factorise l'envoi VAPID lui-même (déjà dupliqué
// 2 fois -- /api/send-push, cron/match-reminders -- avant même cet ajout),
// pour ne pas le tripler/quadrupler encore avec les nouveaux appelants
// server-side (webhooks, cron). N'écrit jamais la cloche (notifications) --
// resté à la charge de chaque appelant, certains l'ayant déjà fait avant
// même d'exister (best-effort, jamais bloquant pour l'action réelle).
export async function sendWebPush(
  subscriptions: PushSubscriptionRow[],
  payload: { title: string; body: string; url: string; tag?: string }
): Promise<{ sent: number; failed: number }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey || subscriptions.length === 0) {
    return { sent: 0, failed: 0 };
  }
  webpush.setVapidDetails("mailto:contact@ubac17.fr", publicKey, privateKey);
  const json = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json)
    )
  );
  const sent = results.filter((r) => r.status === "fulfilled").length;
  return { sent, failed: results.length - sent };
}
