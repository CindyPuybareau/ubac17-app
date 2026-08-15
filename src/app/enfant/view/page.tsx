import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { CHILD_SESSION_COOKIE, verifyChildSession } from "@/lib/child-session";
import ChildDashboard, {
  type ChildBadge,
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
// que des select en dur.
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
    .select("id, first_name, category")
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
          .select("id, title, event_type, is_home, location, salle, start_time, end_time, team_id, teams(name)")
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
        birthDate: row.players.birth_date,
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
    teamName: e.teams?.name ?? null,
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

  // Badge "Assidu" : plus longue série en cours de présences consécutives
  // (Présent/En retard) sur les rendez-vous passés de l'enfant, la plus
  // récente d'abord — un rendez-vous manqué ou jamais répondu casse la
  // série, honnêtement.
  const now = Date.now();
  const ownPastEvents = events
    .filter((e) => new Date(e.startTime).getTime() < now)
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  let streak = 0;
  for (const e of ownPastEvents) {
    const status = rsvpStatusByKey.get(`${e.id}:${playerId}`);
    if (status === "PRESENT" || status === "LATE") streak += 1;
    else break;
  }
  let answered = 0;
  let present = 0;
  for (const e of ownPastEvents) {
    const status = rsvpStatusByKey.get(`${e.id}:${playerId}`);
    if (!status || status === "PENDING") continue;
    answered += 1;
    if (status === "PRESENT" || status === "LATE") present += 1;
  }
  const attendanceRate = answered > 0 ? Math.round((present / answered) * 100) : null;

  const badges: ChildBadge[] = [
    {
      key: "welcome",
      label: teams[0] ? `Membre ${teams[0].category ?? teams[0].name ?? ""}` : "Membre de l'équipe",
      description: "Fait partie de l'équipe UBAC.",
      unlocked: true,
    },
    {
      key: "assidu",
      label: "Assidu",
      description: "5 présences d'affilée aux entraînements et matchs.",
      unlocked: streak >= 5,
      progress: Math.min(streak, 5),
      target: 5,
    },
    {
      key: "toujours-partant",
      label: "Toujours partant",
      description: "80% de présence ou plus (sur au moins 3 réponses).",
      unlocked: attendanceRate !== null && answered >= 3 && attendanceRate >= 80,
      progress: attendanceRate ?? 0,
      target: 80,
      isPercent: true,
    },
  ];

  // Prochain rendez-vous : qui de l'équipe a déjà répondu, pour l'onglet
  // Mon Équipe — jamais une action, juste une lecture de ce que les
  // coéquipiers ont déjà répondu ailleurs (dans leur propre espace).
  const nextEvent = events.find((e) => new Date(e.startTime).getTime() >= now) ?? null;
  const nextEventAttendance = nextEvent
    ? teammates.map((t) => ({
        name: t.firstName,
        status: rsvpStatusByKey.get(`${nextEvent.id}:${t.id}`) ?? "PENDING",
      }))
    : [];

  return (
    <ChildDashboard
      firstName={player.first_name}
      category={player.category}
      teams={teams.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
      ownJersey={teamIds.length > 0 ? ownJerseyByTeamId.get(teamIds[0]) ?? null : null}
      events={events}
      teammates={teammates}
      coaches={coaches}
      badges={badges}
      nextEventAttendance={nextEventAttendance}
    />
  );
}
