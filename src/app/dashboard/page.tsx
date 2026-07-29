import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import AddChildForm from "./add-child-form";
import DashboardTabs, { type DashboardTab } from "./dashboard-tabs";
import AdminView from "./admin-view";
import type { TeamWithMembers } from "./team-manager";
import CoachView from "./coach-view";
import PlayerPanel from "./player-panel";
import FamilyPanel from "./family-panel";
import NextConvocationCard from "./next-convocation-card";
import CoachNextMatchCard from "./coach-next-match-card";
import {
  getNextEventForTeams,
  getPlayerRsvpStatus,
  getPlayerTeamIds,
  getRsvpCounts,
  getTeamRoster,
  getUpcomingEventsForTeam,
  type UpcomingEvent,
} from "./family-data";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category: string | null;
  profile_id: string | null;
};

type Person = { id: string; first_name: string | null; last_name: string | null };

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

  const eventsByTeam: Record<string, UpcomingEvent[]> = {};
  await Promise.all(
    coachedTeams.map(async (team) => {
      eventsByTeam[team.id] = await getUpcomingEventsForTeam(supabase, team.id);
    })
  );

  let adminTeams: TeamWithMembers[] = [];
  let allPlayersForAdmin: Person[] = [];
  let allProfilesForAdmin: Person[] = [];

  if (isAdmin) {
    const [teamsRes, playersRes, profilesRes, teamPlayersRes, teamCoachesRes] =
      await Promise.all([
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
          .select("id, first_name, last_name")
          .order("first_name"),
        supabase.from("team_players").select("team_id, player_id"),
        supabase.from("team_coaches").select("team_id, coach_id"),
      ]);

    const playersById = new Map(
      (playersRes.data ?? []).map((p) => [p.id, p as Person])
    );
    const profilesById = new Map(
      (profilesRes.data ?? []).map((p) => [p.id, p as Person])
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
    allPlayersForAdmin = playersRes.data ?? [];
    allProfilesForAdmin = profilesRes.data ?? [];
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
          allPlayers={allPlayersForAdmin}
          allProfiles={allProfilesForAdmin}
        />
      ),
    });
  }

  if (isCoach) {
    tabs.push({
      key: "coach",
      label: "Équipe",
      content: <CoachView teams={coachedTeams} eventsByTeam={eventsByTeam} />,
    });
  }

  players.forEach((p) => {
    tabs.push({
      key: `player-${p.id}`,
      label: p.isSelf ? "Mes matchs" : p.name,
      content: (
        <PlayerPanel name={p.isSelf ? "toi" : p.name} category={p.category} />
      ),
    });
  });

  if (players.length > 1) {
    tabs.push({
      key: "family",
      label: "Vue famille",
      content: (
        <FamilyPanel
          names={players.map((p) => ({ label: p.name, isSelf: p.isSelf }))}
        />
      ),
    });
  }

  const hasPriorityContent = convocationCards.length > 0 || coachCards.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-zinc-500">Bienvenue,</p>
          <h1 className="text-2xl font-bold text-zinc-900">
            {profile?.first_name ?? user.email}
          </h1>
        </div>
        <SignOutButton />
      </div>

      {isAdmin && (
        <div className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
          <span className="text-sm font-semibold text-green-700">
            Espace Bureau{clubFunction ? ` · ${clubFunction}` : ""}
          </span>
          <span className="text-xs text-green-600">Voir l&apos;onglet Bureau</span>
        </div>
      )}

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
          Aucun espace n&apos;est encore rattaché à ton compte. Ajoute un
          enfant ci-dessous pour commencer à suivre ses matchs.
        </p>
      )}

      <AddChildForm parentId={user.id} />
    </div>
  );
}
