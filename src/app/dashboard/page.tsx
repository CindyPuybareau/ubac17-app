import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import DashboardTabs, { type DashboardTab } from "./dashboard-tabs";
import AdminView from "./admin-view";
import type { TeamWithMembers } from "./team-manager";
import CoachView from "./coach-view";
import CalendarView from "./calendar-view";
import NextConvocationCard from "./next-convocation-card";
import CoachNextMatchCard from "./coach-next-match-card";
import {
  getNextEventForTeams,
  getPlayerRsvpStatus,
  getPlayerTeamIds,
  getRsvpCounts,
  getTeamRoster,
} from "./family-data";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category: string | null;
  profile_id: string | null;
};

type Person = { id: string; first_name: string | null; last_name: string | null };

export type AdminCotisation = {
  id: string;
  saison: string;
  prix: number | null;
  remise: number | null;
  paiement: number | null;
  statut: string | null;
  mode_paiement: string | null;
  playerName: string;
  category: string | null;
};

export type AdminUpcomingEvent = {
  id: string;
  title: string | null;
  event_type: string | null;
  location: string | null;
  start_time: string;
  teamId: string | null;
  teamName: string;
  rsvpCounts: {
    present: number;
    absent: number;
    late: number;
    pending: number;
  };
};

function buildRsvpCounts(
  rsvpsByEvent: Map<
    string,
    { present: number; absent: number; late: number; answered: number }
  >,
  eventId: string,
  rosterSize: number
) {
  const rsvp = rsvpsByEvent.get(eventId);
  const present = rsvp?.present ?? 0;
  const absent = rsvp?.absent ?? 0;
  const late = rsvp?.late ?? 0;
  const answered = rsvp?.answered ?? 0;
  return {
    present,
    absent,
    late,
    pending: Math.max(0, rosterSize - answered),
  };
}

async function fetchRsvpsByEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventIds: string[]
) {
  const rsvpsByEvent = new Map<
    string,
    { present: number; absent: number; late: number; answered: number }
  >();
  if (eventIds.length === 0) return rsvpsByEvent;

  const { data: rsvpRows } = await supabase
    .from("rsvps")
    .select("event_id, status")
    .in("event_id", eventIds);

  (rsvpRows ?? []).forEach((r) => {
    const bucket = rsvpsByEvent.get(r.event_id) ?? {
      present: 0,
      absent: 0,
      late: 0,
      answered: 0,
    };
    bucket.answered += 1;
    if (r.status === "PRESENT") bucket.present += 1;
    else if (r.status === "ABSENT") bucket.absent += 1;
    else if (r.status === "LATE") bucket.late += 1;
    rsvpsByEvent.set(r.event_id, bucket);
  });

  return rsvpsByEvent;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/connexion");
  }

  const [profileResult, adminResult, coachResult, playerLinksResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", user.id)
        .single(),
      supabase
        .from("club_administrators")
        .select("role, club_function")
        .eq("email", user.email ?? "")
        .maybeSingle(),
      supabase
        .from("team_coaches")
        .select("teams(id, name, category, ffbb_url)")
        .eq("coach_id", user.id),
      supabase
        .from("parent_player")
        .select("players(id, first_name, last_name, category, profile_id)")
        .eq("parent_id", user.id),
    ]);

  const profile = profileResult.data;
  const isAdmin = Boolean(adminResult.data);
  const clubFunction = adminResult.data?.club_function ?? null;

  type CoachedTeam = {
    id: string;
    name: string | null;
    category: string | null;
    ffbb_url: string | null;
  };

  const coachedTeams = (coachResult.data ?? [])
    .map((row) => row.teams as unknown as CoachedTeam | null)
    .filter((t): t is CoachedTeam => Boolean(t));
  const isCoach = coachedTeams.length > 0;

  const players = (playerLinksResult.data ?? [])
    .map((link) => link.players as unknown as PlayerRow | null)
    .filter((p): p is PlayerRow => Boolean(p))
    .map((p) => ({
      id: p.id,
      name: p.first_name ?? "Joueur",
      category: p.category,
      isSelf: p.profile_id === user.id,
    }));

  // Priority zone: next convocation per linked player.
  const convocationCards = (
    await Promise.all(
      players.map(async (p) => {
        const teamIds = await getPlayerTeamIds(supabase, p.id);
        const event = await getNextEventForTeams(supabase, teamIds);
        if (!event) return null;
        const status = await getPlayerRsvpStatus(supabase, event.id, p.id);
        return { player: p, event, status };
      })
    )
  ).filter((c): c is NonNullable<typeof c> => Boolean(c));

  // Priority zone: next match status per coached team.
  const coachCards = await Promise.all(
    coachedTeams.map(async (team) => {
      const event = await getNextEventForTeams(supabase, [team.id]);
      const roster = await getTeamRoster(supabase, team.id);
      const counts = event
        ? await getRsvpCounts(supabase, event.id, roster.length)
        : null;
      return { team, event, counts, roster };
    })
  );

  let adminTeams: TeamWithMembers[] = [];
  let allProfilesForAdmin: Person[] = [];
  let adminCotisations: AdminCotisation[] = [];
  let adminUpcomingEvents: AdminUpcomingEvent[] = [];
  const adminContactPhoneByPlayerId: Record<string, string> = {};

  if (isAdmin) {
    const [
      teamsRes,
      playersRes,
      profilesRes,
      teamPlayersRes,
      teamCoachesRes,
      cotisationsRes,
      upcomingEventsRes,
      parentPlayerRes,
    ] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, category, ffbb_url")
        .order("category"),
      supabase
        .from("players")
        .select("id, first_name, last_name")
        .order("first_name"),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, phone")
        .order("first_name"),
      supabase.from("team_players").select("team_id, player_id"),
      supabase.from("team_coaches").select("team_id, coach_id"),
      supabase
        .from("cotisations")
        .select(
          "id, saison, prix, remise, paiement, statut, mode_paiement, players(first_name, last_name, category)"
        )
        .order("saison", { ascending: false }),
      supabase
        .from("events")
        .select("id, title, event_type, location, start_time, teams(id, name, category)")
        .order("start_time", { ascending: true }),
      supabase.from("parent_player").select("parent_id, player_id"),
    ]);

    const playersById = new Map(
      (playersRes.data ?? []).map((p) => [p.id, p as Person])
    );
    const profilesById = new Map(
      (profilesRes.data ?? []).map((p) => [p.id, p as Person])
    );
    const phoneByProfileId = new Map(
      (profilesRes.data ?? []).map((p) => [
        p.id,
        (p as { phone: string | null }).phone,
      ])
    );

    const rosterByTeam = new Map<string, Person[]>();
    (teamPlayersRes.data ?? []).forEach((tp) => {
      const player = playersById.get(tp.player_id);
      if (!player) return;
      const list = rosterByTeam.get(tp.team_id) ?? [];
      list.push(player);
      rosterByTeam.set(tp.team_id, list);
    });

    const coachesByTeam = new Map<string, Person[]>();
    (teamCoachesRes.data ?? []).forEach((tc) => {
      const coach = profilesById.get(tc.coach_id);
      if (!coach) return;
      const list = coachesByTeam.get(tc.team_id) ?? [];
      list.push(coach);
      coachesByTeam.set(tc.team_id, list);
    });

    adminTeams = (teamsRes.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      ffbb_url: t.ffbb_url,
      players: rosterByTeam.get(t.id) ?? [],
      coaches: coachesByTeam.get(t.id) ?? [],
    }));
    allProfilesForAdmin = profilesRes.data ?? [];

    (parentPlayerRes.data ?? []).forEach((pp) => {
      const phone = phoneByProfileId.get(pp.parent_id);
      if (phone) adminContactPhoneByPlayerId[pp.player_id] = phone;
    });

    const rsvpsByEvent = await fetchRsvpsByEvent(
      supabase,
      (upcomingEventsRes.data ?? []).map((e) => e.id)
    );

    adminCotisations = (cotisationsRes.data ?? []).map((c) => {
      const player = c.players as unknown as {
        first_name: string | null;
        last_name: string | null;
        category: string | null;
      } | null;
      return {
        id: c.id,
        saison: c.saison,
        prix: c.prix,
        remise: c.remise,
        paiement: c.paiement,
        statut: c.statut,
        mode_paiement: c.mode_paiement,
        playerName:
          [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
          "Joueur",
        category: player?.category ?? null,
      };
    });

    adminUpcomingEvents = (upcomingEventsRes.data ?? []).map((e) => {
      const team = e.teams as unknown as {
        id: string;
        name: string | null;
        category: string | null;
      } | null;
      const rosterSize = team ? rosterByTeam.get(team.id)?.length ?? 0 : 0;
      return {
        id: e.id,
        title: e.title,
        event_type: e.event_type,
        location: e.location,
        start_time: e.start_time,
        teamId: team?.id ?? null,
        teamName: team?.name ?? "Équipe",
        rsvpCounts: buildRsvpCounts(rsvpsByEvent, e.id, rosterSize),
      };
    });
  }

  let coachTeamsWithRoster: TeamWithMembers[] = [];
  let coachEvents: AdminUpcomingEvent[] = [];
  const coachContactPhoneByPlayerId: Record<string, string> = {};

  if (isCoach) {
    const coachedTeamIds = coachedTeams.map((t) => t.id);
    const [teamPlayersRes, teamCoachesRes, eventsRes] = await Promise.all([
      supabase
        .from("team_players")
        .select("team_id, player_id")
        .in("team_id", coachedTeamIds),
      supabase
        .from("team_coaches")
        .select("team_id, coach_id")
        .in("team_id", coachedTeamIds),
      supabase
        .from("events")
        .select(
          "id, title, event_type, location, start_time, teams(id, name, category)"
        )
        .in("team_id", coachedTeamIds)
        .order("start_time", { ascending: true }),
    ]);

    const playerIds = Array.from(
      new Set((teamPlayersRes.data ?? []).map((r) => r.player_id))
    );
    const coachIds = Array.from(
      new Set((teamCoachesRes.data ?? []).map((r) => r.coach_id))
    );

    const [playersRes, coachProfilesRes, parentPlayerRes] = await Promise.all([
      playerIds.length > 0
        ? supabase
            .from("players")
            .select("id, first_name, last_name")
            .in("id", playerIds)
        : Promise.resolve({ data: [] as Person[] }),
      coachIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .in("id", coachIds)
        : Promise.resolve({ data: [] as Person[] }),
      playerIds.length > 0
        ? supabase
            .from("parent_player")
            .select("parent_id, player_id")
            .in("player_id", playerIds)
        : Promise.resolve({ data: [] as { parent_id: string; player_id: string }[] }),
    ]);

    const playersById = new Map(
      (playersRes.data ?? []).map((p) => [p.id, p as Person])
    );
    const coachProfilesById = new Map(
      (coachProfilesRes.data ?? []).map((p) => [p.id, p as Person])
    );

    const rosterByTeam = new Map<string, Person[]>();
    (teamPlayersRes.data ?? []).forEach((tp) => {
      const player = playersById.get(tp.player_id);
      if (!player) return;
      const list = rosterByTeam.get(tp.team_id) ?? [];
      list.push(player);
      rosterByTeam.set(tp.team_id, list);
    });

    const coachesByTeam = new Map<string, Person[]>();
    (teamCoachesRes.data ?? []).forEach((tc) => {
      const coach = coachProfilesById.get(tc.coach_id);
      if (!coach) return;
      const list = coachesByTeam.get(tc.team_id) ?? [];
      list.push(coach);
      coachesByTeam.set(tc.team_id, list);
    });

    coachTeamsWithRoster = coachedTeams.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      ffbb_url: t.ffbb_url,
      players: rosterByTeam.get(t.id) ?? [],
      coaches: coachesByTeam.get(t.id) ?? [],
    }));

    const parentIds = Array.from(
      new Set((parentPlayerRes.data ?? []).map((r) => r.parent_id))
    );
    const { data: parentProfiles } =
      parentIds.length > 0
        ? await supabase.from("profiles").select("id, phone").in("id", parentIds)
        : { data: [] as { id: string; phone: string | null }[] };
    const phoneByParentId = new Map(
      (parentProfiles ?? []).map((p) => [p.id, p.phone])
    );
    (parentPlayerRes.data ?? []).forEach((pp) => {
      const phone = phoneByParentId.get(pp.parent_id);
      if (phone) coachContactPhoneByPlayerId[pp.player_id] = phone;
    });

    const rsvpsByEvent = await fetchRsvpsByEvent(
      supabase,
      (eventsRes.data ?? []).map((e) => e.id)
    );

    coachEvents = (eventsRes.data ?? []).map((e) => {
      const team = e.teams as unknown as {
        id: string;
        name: string | null;
        category: string | null;
      } | null;
      const rosterSize = team ? rosterByTeam.get(team.id)?.length ?? 0 : 0;
      return {
        id: e.id,
        title: e.title,
        event_type: e.event_type,
        location: e.location,
        start_time: e.start_time,
        teamId: team?.id ?? null,
        teamName: team?.name ?? "Équipe",
        rsvpCounts: buildRsvpCounts(rsvpsByEvent, e.id, rosterSize),
      };
    });
  }

  // Parent/joueur: un seul calendrier lecture-seule + RSVP, tous enfants confondus.
  let familyEvents: AdminUpcomingEvent[] = [];
  let familyRsvpPlayers: { id: string; name: string; teamIds: string[] }[] = [];
  const familyRsvpStatusByKey: Record<string, string> = {};

  if (players.length > 0) {
    const playerTeamIdsList = await Promise.all(
      players.map((p) => getPlayerTeamIds(supabase, p.id))
    );
    familyRsvpPlayers = players.map((p, i) => ({
      id: p.id,
      name: p.isSelf ? "Toi" : p.name,
      teamIds: playerTeamIdsList[i],
    }));

    const allTeamIds = Array.from(new Set(playerTeamIdsList.flat()));

    if (allTeamIds.length > 0) {
      const { data: eventsData } = await supabase
        .from("events")
        .select(
          "id, title, event_type, location, start_time, teams(id, name, category)"
        )
        .in("team_id", allTeamIds)
        .order("start_time", { ascending: true });

      const eventIds = (eventsData ?? []).map((e) => e.id);
      const familyPlayerIds = players.map((p) => p.id);

      if (eventIds.length > 0 && familyPlayerIds.length > 0) {
        const { data: rsvpRows } = await supabase
          .from("rsvps")
          .select("event_id, player_id, status")
          .in("event_id", eventIds)
          .in("player_id", familyPlayerIds);

        (rsvpRows ?? []).forEach((r) => {
          familyRsvpStatusByKey[`${r.event_id}:${r.player_id}`] = r.status;
        });
      }

      familyEvents = (eventsData ?? []).map((e) => {
        const team = e.teams as unknown as {
          id: string;
          name: string | null;
          category: string | null;
        } | null;
        return {
          id: e.id,
          title: e.title,
          event_type: e.event_type,
          location: e.location,
          start_time: e.start_time,
          teamId: team?.id ?? null,
          teamName: team?.name ?? "Équipe",
          rsvpCounts: { present: 0, absent: 0, late: 0, pending: 0 },
        };
      });
    }
  }

  const tabs: DashboardTab[] = [];

  if (isAdmin) {
    tabs.push({
      key: "admin",
      label: "Bureau",
      content: (
        <AdminView
          clubFunction={clubFunction}
          teams={adminTeams}
          allProfiles={allProfilesForAdmin}
          cotisations={adminCotisations}
          upcomingEvents={adminUpcomingEvents}
          contactPhoneByPlayerId={adminContactPhoneByPlayerId}
        />
      ),
    });
  }

  if (isCoach) {
    tabs.push({
      key: "coach",
      label: "Équipe",
      content: (
        <CoachView
          teams={coachTeamsWithRoster}
          events={coachEvents}
          contactPhoneByPlayerId={coachContactPhoneByPlayerId}
        />
      ),
    });
  }

  if (players.length > 0) {
    tabs.push({
      key: "family-calendar",
      label: "Mes matchs",
      content: (
        <CalendarView
          events={familyEvents}
          rsvp={{ players: familyRsvpPlayers, statusByKey: familyRsvpStatusByKey }}
        />
      ),
    });
  }

  const hasPriorityContent = convocationCards.length > 0 || coachCards.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 bg-navy px-4 py-3 sm:px-6">
        <div
          className={`mx-auto flex w-full items-center justify-between ${isAdmin ? "max-w-6xl" : "max-w-3xl"}`}
        >
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="UBAC 17" width={32} height={32} className="h-8 w-8 object-contain" priority />
            <span className="text-sm font-semibold text-white">UBAC 17</span>
          </div>
          <div className="hidden sm:block">
            <SignOutButton />
          </div>
        </div>
      </header>

      <div
        className={`mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 sm:py-10 ${isAdmin ? "max-w-6xl" : "max-w-3xl"}`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-zinc-500">Bienvenue,</p>
            <h1 className="text-2xl font-bold text-zinc-900">
              {profile?.first_name ?? user.email}
            </h1>
          </div>
          <div className="sm:hidden">
            <SignOutButton />
          </div>
        </div>

        {hasPriorityContent && (
          <div className="flex flex-col gap-4">
          {convocationCards.map(({ player, event, status }) => (
            <NextConvocationCard
              key={player.id}
              playerName={player.isSelf ? "toi" : player.name}
              playerId={player.id}
              event={event}
              status={status}
            />
          ))}
          {coachCards.map(({ team, event, counts, roster }) => (
            <CoachNextMatchCard
              key={team.id}
              teamName={`${team.name ?? "Équipe"}${
                team.category ? ` · ${team.category}` : ""
              }`}
              event={event}
              counts={counts}
              roster={roster}
            />
          ))}
        </div>
      )}

      <DashboardTabs tabs={tabs} />

      {tabs.length === 0 && (
        <p className="text-sm text-zinc-500">
          Aucun espace n&apos;est encore rattaché à ton compte. Contacte le
          Bureau pour qu&apos;il associe ton enfant à ton adresse email.
        </p>
      )}
      </div>
    </div>
  );
}
