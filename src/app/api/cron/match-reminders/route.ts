import { NextResponse } from "next/server";
import webpush from "web-push";
import { createServiceClient } from "@/lib/supabase/service";
import { isMatchType, homeAwayLabel } from "@/app/dashboard/event-style";
import { parseMatchTitle } from "@/lib/match-display";

// Rappel automatique la veille d'un match : plus besoin que le coach y
// pense. Déclenché une fois par jour par Vercel Cron (voir vercel.json).
// Protégé par CRON_SECRET : Vercel envoie automatiquement
// "Authorization: Bearer <CRON_SECRET>" sur les appels programmés dès que
// cette variable existe côté projet — un appel externe sans le bon secret
// est rejeté. Fermé par défaut (fail closed) : si la variable n'est pas
// posée côté Vercel, la route refuse tout appel plutôt que de rester
// ouverte à qui la devine — sans ça, n'importe qui pouvait forcer l'envoi
// de vraies notifications push à tout le club à volonté.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "Clés VAPID absentes de l'environnement." }, { status: 500 });
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Interrupteur Bureau (onglet Accueil) — désactivé par défaut : aucun
  // rappel ne part tant que le Bureau ne l'a pas explicitement activé.
  const { data: settings } = await supabase
    .from("club_settings")
    .select("match_reminder_enabled")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.match_reminder_enabled) {
    return NextResponse.json({ sent: 0, matches: 0, paused: true });
  }

  // "Demain" en heure de Paris, pas UTC : un match à 19h ne doit pas
  // glisser dans le lot de la veille juste parce que le serveur (Vercel,
  // toujours en UTC) considère qu'on est encore le jour d'avant.
  const parisNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const tomorrow = new Date(parisNow.getFullYear(), parisNow.getMonth(), parisNow.getDate() + 1);
  const dayAfter = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + 1);

  const { data: eventsData, error } = await supabase
    .from("events")
    .select(
      "id, title, event_type, is_home, location, salle, start_time, team_id, reminder_sent_at, teams(name)"
    )
    .gte("start_time", tomorrow.toISOString())
    .lt("start_time", dayAfter.toISOString())
    .is("reminder_sent_at", null);

  if (error) {
    // Message générique côté client : le détail exact (colonnes, table)
    // n'a rien à faire dans une réponse HTTP, même pour une route
    // protégée par secret.
    return NextResponse.json({ error: "Erreur lors de la lecture des événements." }, { status: 500 });
  }

  // Seuls les vrais matchs (pas les entraînements/tournois/événements
  // club) ont un adversaire et une raison d'être rappelés la veille — et
  // seulement s'ils sont rattachés à une équipe (un match sans équipe
  // n'existe pas dans les faits, mais un événement club, lui, n'est
  // jamais un match).
  const matches = (eventsData ?? []).filter(
    (e): e is typeof e & { team_id: string } => isMatchType(e.event_type) && Boolean(e.team_id)
  );

  if (matches.length === 0) {
    return NextResponse.json({ sent: 0, matches: 0 });
  }

  webpush.setVapidDetails("mailto:contact@ubac17.fr", publicKey, privateKey);

  let totalSent = 0;
  for (const event of matches) {
    const team = event.teams as unknown as { name: string | null } | null;
    const parsed = parseMatchTitle(event.title);
    const home = event.is_home ?? parsed.isHome;
    const homeAway = homeAwayLabel(home);
    const lieu = event.salle || event.location;
    const heure = new Date(event.start_time).toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });

    const title = `UBAC — ${team?.name ?? "Match"} demain`;
    const body = [
      heure,
      homeAway ? homeAway.toLowerCase() : null,
      parsed.opponent ? `contre ${parsed.opponent}` : null,
      lieu,
    ]
      .filter(Boolean)
      .join(" · ");

    // Historique en base pour la cloche in-app, comme dans /api/send-push
    // — indépendant de subs.length : un rappel reste consultable dans
    // l'historique même sans personne d'abonné au push ce jour-là.
    await supabase.from("notifications").insert({
      team_id: event.team_id,
      event_id: event.id,
      title,
      body,
      url: "/dashboard",
    });

    const subs = await pushSubscriptionsForTeam(supabase, event.team_id);
    if (subs.length > 0) {
      const payload = JSON.stringify({
        title,
        body,
        url: "/dashboard",
        tag: `reminder-${event.id}`,
      });
      const results = await Promise.allSettled(
        subs.map((s) =>
          webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          )
        )
      );
      totalSent += results.filter((r) => r.status === "fulfilled").length;
    }

    // Marqué "envoyé" même si personne n'était abonné aux notifications
    // ce jour-là : ce n'est pas une erreur à réessayer demain, juste un
    // fait — sans quoi le job retenterait indéfiniment ce même match.
    const { error: markSentError } = await supabase
      .from("events")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", event.id);
    // Audit du 31/08 : ce marqueur est ce qui empêche un double envoi — un
    // échec silencieux ici ferait renvoyer le même rappel le lendemain.
    if (markSentError) {
      console.error("[match-reminders] marquage reminder_sent_at échoué:", markSentError);
    }
  }

  return NextResponse.json({ sent: totalSent, matches: matches.length });
}

// Mêmes destinataires que push_targets_for_event côté app (parents,
// joueurs avec compte, coachs de l'équipe) — reconstruit ici en requêtes
// directes plutôt que d'appeler cette fonction SQL : elle exige un
// appelant authentifié coach/Bureau (is_club_admin()/is_team_coach()), or
// un cron n'a pas de session — auth.uid() y vaudrait NULL et elle ne
// renverrait jamais rien. Le client service_role contourne de toute façon
// la RLS, ces requêtes n'ont donc pas besoin de cette garde ici.
async function pushSubscriptionsForTeam(
  supabase: ReturnType<typeof createServiceClient>,
  teamId: string
) {
  const { data: rosterRows } = await supabase
    .from("team_players")
    .select("player_id")
    .eq("team_id", teamId);
  const playerIds = (rosterRows ?? []).map((r) => r.player_id);

  const profileIds = new Set<string>();

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

  const { data: coachRows } = await supabase
    .from("team_coaches")
    .select("coach_id")
    .eq("team_id", teamId);
  (coachRows ?? []).forEach((r) => profileIds.add(r.coach_id));

  if (profileIds.size === 0) return [];

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("profile_id", Array.from(profileIds));

  return (subs ?? []) as { endpoint: string; p256dh: string; auth: string }[];
}
