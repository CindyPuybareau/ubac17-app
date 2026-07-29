import { redirect } from "next/navigation";
import Image from "next/image";
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
};

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
  let adminCotisations: AdminCotisation[] = [];
  let adminUpcomingEvents: AdminUpcomingEvent[] = [];

  if (isAdmin) {
    const [
      teamsRes,
      playersRes,
      profilesRes,
      teamPlayersRes,
      teamCoachesRes,
      cotisationsRes,
      upcomingEventsRes,
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
        .select("id, first_name, last_name")
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
        .gte("start_time", new Date().toISOString())
        .order("start_time", { ascending: true })
        .limit(30),
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
      return {
        id: e.id,
        title: e.title,
        event_type: e.event_type,
        location: e.location,
        start_time: e.start_time,
        teamId: team?.id ?? null,
        teamName: team?.name ?? "Équipe",
      };
    });
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
          cotisations={adminCotisations}
          upcomingEvents={adminUpcomingEvents}
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
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 bg-navy px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="UBAC 17" width={32} height={32} className="h-8 w-8 object-contain" priority />
            <span className="text-sm font-semibold text-white">UBAC 17</span>
          </div>
          <div className="hidden sm:block">
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 sm:py-10">
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

        {isAdmin && (
          <div className="flex items-center justify-between rounded-2xl border border-ubac-yellow/40 bg-ubac-yellow/10 px-4 py-3">
            <span className="text-sm font-semibold text-ubac-yellow-dark">
              Espace Bureau{clubFunction ? ` · ${clubFunction}` : ""}
            </span>
            <span className="text-xs text-ubac-yellow-dark">Voir l&apos;onglet Bureau</span>
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
    </div>
  );
}
