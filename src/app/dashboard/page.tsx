import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import AddChildForm from "./add-child-form";
import DashboardTabs, { type DashboardTab } from "./dashboard-tabs";
import AdminView from "./admin-view";
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
} from "./family-data";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category: string | null;
  profile_id: string | null;
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
        .select("teams(id, name, category)")
        .eq("coach_id", user.id),
      supabase
        .from("parent_player")
        .select("players(id, first_name, last_name, category, profile_id)")
        .eq("parent_id", user.id),
    ]);

  const profile = profileResult.data;
  const isAdmin = Boolean(adminResult.data);
  const clubFunction = adminResult.data?.club_function ?? null;

  const coachedTeams = (coachResult.data ?? [])
    .map(
      (row) =>
        row.teams as unknown as {
          id: string;
          name: string | null;
          category: string | null;
        } | null
    )
    .filter((t): t is { id: string; name: string | null; category: string | null } =>
      Boolean(t)
    );
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

  const tabs: DashboardTab[] = [];

  if (isAdmin) {
    tabs.push({
      key: "admin",
      label: "Bureau",
      content: <AdminView clubFunction={clubFunction} />,
    });
  }

  if (isCoach) {
    tabs.push({
      key: "coach",
      label: "Équipe",
      content: <CoachView teams={coachedTeams} />,
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
