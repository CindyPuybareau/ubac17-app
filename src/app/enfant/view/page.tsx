import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { CHILD_SESSION_COOKIE, verifyChildSession } from "@/lib/child-session";
import ChildDashboard, {
  type ChildAttendanceStats,
  type ChildCoach,
  type ChildEvent,
  type ChildTeammate,
} from "./child-dashboard";

// Toute la lecture de données vit ici, côté serveur, avec service_role
// (l'enfant n'a pas d'auth.uid()). ChildDashboard et ses onglets ne
// reçoivent que des props déjà calculées, en lecture seule — aucun de ces
// composants n'importe jamais createClient() ni ne fait le moindre appel
// réseau capable d'écrire. C'est cette page, pas une policy RLS, qui
// garantit qu'un enfant ne peut jamais rien modifier : elle ne construit
// que des select en dur. Seule exception à ce principe dans tout l'espace
// Enfant : /api/child-avatar (photo de profil, retour de Cindy du
// 2026-08-22, confirmé explicitement) — une route séparée, jamais cette
// page.
export default async function ChildViewPage() {
  const cookieStore = await cookies();
  const playerId = verifyChildSession(cookieStore.get(CHILD_SESSION_COOKIE)?.value);

  if (!playerId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Ta session a expiré. Redemande le lien à un parent pour te reconnecter.
        </p>
      </div>
    );
  }

  const supabase = createServiceClient();

  const { data: player } = await supabase
    .from("players")
    .select("id, first_name, category, notifications_enabled, avatar_url")
    .eq("id", playerId)
    .maybeSingle();

  if (!player) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Profil introuvable. Redemande le lien à un parent et réessaie.
        </p>
      </div>
    );
  }

  const { data: ownTeamLinks } = await supabase
    .from("team_players")
    .select("team_id, jersey_number, position")
    .eq("player_id", playerId);
  const teamIds = (ownTeamLinks ?? []).map((t) => t.team_id);
  const ownJerseyByTeamId = new Map(
    (ownTeamLinks ?? []).map((t) => [t.team_id, { jersey: t.jersey_number, position: t.position }])
  );

  const [teamsRes, teammatesRes, coachesRes, eventsRes] = await Promise.all([
    teamIds.length > 0
      ? supabase.from("teams").select("id, name, category").in("id", teamIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; category: string | null }[] }),
    teamIds.length > 0
      ? supabase
          .from("team_players")
          .select("team_id, jersey_number, position, players(id, first_name, birth_date)")
          .in("team_id", teamIds)
      : Promise.resolve({ data: [] as never[] }),
    teamIds.length > 0
      ? supabase.from("team_coaches").select("team_id, profiles(id, first_name, last_name)").in("team_id", teamIds)
      : Promise.resolve({ data: [] as never[] }),
    teamIds.length > 0
      ? supabase
          .from("events")
          .select(
            "id, title, event_type, is_home, location, salle, start_time, end_time, team_id, team_score, opponent_score, teams(name)"
          )
          .in("team_id", teamIds)
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const teams = (teamsRes.data ?? []) as { id: string; name: string | null; category: string | null }[];

  const teammateRows = (teammatesRes.data ?? []) as unknown as {
    team_id: string;
    jersey_number: number | null;
    position: string | null;
    players: { id: string; first_name: string | null; birth_date: string | null } | null;
  }[];
  const teammatesByPlayerId = new Map<string, ChildTeammate>();
  for (const row of teammateRows) {
    if (!row.players) continue;
    if (!teammatesByPlayerId.has(row.players.id)) {
      teammatesByPlayerId.set(row.players.id, {
        id: row.players.id,
        firstName: row.players.first_name,
        // Année neutralisée : l'UI (calendrier, pastille "Anniversaires")
        // n'affiche jamais que le jour/mois, mais la vraie date de
        // naissance complète — donc l'âge exact — partait quand même dans
        // les props envoyées au client, lisible par n'importe quel enfant
        // via les DevTools. Une année fixe garde le format "YYYY-MM-DD"
        // que localDateFromParts() attend, sans exposer l'année réelle.
        birthDate: row.players.birth_date ? `2000-${row.players.birth_date.slice(5)}` : null,
        jerseyNumber: row.jersey_number,
        position: row.position,
        isSelf: row.players.id === playerId,
      });
    }
  }
  const teammates = Array.from(teammatesByPlayerId.values());

  const coachRows = (coachesRes.data ?? []) as unknown as {
    team_id: string;
    profiles: { id: string; first_name: string | null; last_name: string | null } | null;
  }[];
  const coachesByProfileId = new Map<string, ChildCoach>();
  for (const row of coachRows) {
    if (!row.profiles) continue;
    if (!coachesByProfileId.has(row.profiles.id)) {
      coachesByProfileId.set(row.profiles.id, {
        id: row.profiles.id,
        firstName: row.profiles.first_name,
        lastName: row.profiles.last_name,
      });
    }
  }
  const coaches = Array.from(coachesByProfileId.values());

  const eventRows = (eventsRes.data ?? []) as unknown as {
    id: string;
    title: string | null;
    event_type: string | null;
    is_home: boolean | null;
    location: string | null;
    salle: string | null;
    start_time: string;
    end_time: string | null;
    team_id: string | null;
    team_score: number | null;
    opponent_score: number | null;
    teams: { name: string | null } | null;
  }[];
  const events: ChildEvent[] = eventRows.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.event_type,
    isHome: e.is_home,
    location: e.location,
    salle: e.salle,
    startTime: e.start_time,
    endTime: e.end_time,
    teamId: e.team_id,
    teamName: e.teams?.name ?? null,
    teamScore: e.team_score,
    opponentScore: e.opponent_score,
  }));

  // RSVPs : nécessaires à la fois pour "qui vient au prochain rendez-vous"
  // (onglet Mon Équipe) et pour le badge d'assiduité de l'enfant (onglet
  // Défis) — jamais pour les modifier, seulement pour les lire.
  const eventIds = events.map((e) => e.id);
  const { data: rsvpRows } =
    eventIds.length > 0
      ? await supabase.from("rsvps").select("event_id, player_id, status").in("event_id", eventIds)
      : { data: [] as { event_id: string; player_id: string; status: string | null }[] };
  const rsvpStatusByKey = new Map(
    (rsvpRows ?? []).map((r) => [`${r.event_id}:${r.player_id}`, r.status])
  );

  // "Mes Présences" : un vrai bilan d'assiduité, pas un badge à débloquer
  // — pour chaque famille de types (entraînements / matchs-tournois), le
  // nombre de rendez-vous passés où l'enfant était Présent/En retard sur
  // le total de rendez-vous passés (répondu ou non : un rendez-vous
  // manqué sans réponse compte quand même contre le total, honnêtement).
  const now = Date.now();
  const ownPastEvents = events.filter((e) => new Date(e.startTime).getTime() < now);

  function attendanceFor(predicate: (eventType: string | null) => boolean): ChildAttendanceStats {
    const relevant = ownPastEvents.filter((e) => predicate(e.eventType));
    let present = 0;
    for (const e of relevant) {
      const status = rsvpStatusByKey.get(`${e.id}:${playerId}`);
      if (status === "PRESENT" || status === "LATE") present += 1;
    }
    return { present, total: relevant.length };
  }

  const presence = {
    trainings: attendanceFor((t) => t === "TRAINING"),
    matches: attendanceFor((t) => t === "MATCH" || t === "FRIENDLY" || t === "TOURNAMENT"),
  };

  // Prochain rendez-vous : qui de l'équipe a déjà répondu, pour l'onglet
  // Mon Équipe — jamais une action, juste une lecture de ce que les
  // coéquipiers ont déjà répondu ailleurs (dans leur propre espace).
  const nextEvent = events.find((e) => new Date(e.startTime).getTime() >= now) ?? null;
  // Restreint à l'effectif de l'équipe du prochain événement : un enfant
  // sur deux équipes (cas prévu ailleurs, voir le sélecteur d'équipe de
  // ChildResultsTab) voyait sinon tous ses coéquipiers des DEUX équipes
  // mélangés ici, même ceux jamais convoqués à ce rendez-vous précis.
  const nextEventTeammateIds = nextEvent
    ? new Set(
        teammateRows.filter((r) => r.team_id === nextEvent.teamId).map((r) => r.players?.id).filter(Boolean)
      )
    : new Set<string | undefined>();
  const nextEventAttendance = nextEvent
    ? teammates
        .filter((t) => nextEventTeammateIds.has(t.id))
        .map((t) => ({
          name: t.firstName,
          status: rsvpStatusByKey.get(`${nextEvent.id}:${t.id}`) ?? "PENDING",
        }))
    : [];

  // Cloche de notifications : mêmes alertes que Parent/Coach (voir la
  // migration 20260817000000_notifications.sql), lues ici en service_role
  // et filtrées à la main sur les équipes de l'enfant — pas de fonction
  // SQL notifications_for_me() côté enfant, elle repose sur auth.uid() qui
  // n'existe pas pour lui.
  const notificationsEnabled = player.notifications_enabled ?? true;
  let notifications: {
    id: string;
    teamName: string | null;
    title: string;
    body: string;
    createdAt: string;
    readAt: string | null;
  }[] = [];
  if (notificationsEnabled) {
    const notifQuery = supabase
      .from("notifications")
      .select("id, team_id, title, body, created_at, teams(name)")
      .order("created_at", { ascending: false })
      .limit(30);
    const { data: notifRows } =
      teamIds.length > 0
        ? await notifQuery.or(`team_id.is.null,team_id.in.(${teamIds.join(",")})`)
        : await notifQuery.is("team_id", null);

    const notifIds = (notifRows ?? []).map((n) => n.id);
    const { data: readRows } =
      notifIds.length > 0
        ? await supabase
            .from("notification_reads")
            .select("notification_id, read_at")
            .eq("player_id", playerId)
            .in("notification_id", notifIds)
        : { data: [] as { notification_id: string; read_at: string }[] };
    const readAtByNotifId = new Map((readRows ?? []).map((r) => [r.notification_id, r.read_at]));

    notifications = (notifRows ?? []).map((n) => ({
      id: n.id,
      teamName: (n.teams as unknown as { name: string | null } | null)?.name ?? null,
      title: n.title,
      body: n.body,
      createdAt: n.created_at,
      readAt: readAtByNotifId.get(n.id) ?? null,
    }));
  }

  // "Mes pénalités" (retour de Cindy du 2026-08-22), lecture seule, comme
  // le reste de cet espace — lues en service_role et filtrées à la main
  // sur playerId, même raison que notifications ci-dessus (pas
  // d'auth.uid() côté enfant, la RLS "select own linked penalites" ne
  // s'applique pas à cette session).
  const { data: penaliteRows } = await supabase
    .from("penalites")
    .select("id, amount, notes, penalite_date, statut, paid_at")
    .eq("player_id", playerId)
    .order("penalite_date", { ascending: false });
  const penalites = (penaliteRows ?? []).map((p) => ({
    id: p.id,
    amount: p.amount,
    notes: p.notes,
    penaliteDate: p.penalite_date,
    statut: p.statut,
    paidAt: p.paid_at,
  }));

  return (
    <ChildDashboard
      firstName={player.first_name}
      avatarUrl={player.avatar_url}
      category={player.category}
      teams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
      ownJersey={teamIds.length > 0 ? ownJerseyByTeamId.get(teamIds[0]) ?? null : null}
      events={events}
      teammates={teammates}
      coaches={coaches}
      presence={presence}
      nextEventAttendance={nextEventAttendance}
      notifications={notifications}
      notificationsEnabled={notificationsEnabled}
      penalites={penalites}
    />
  );
}
