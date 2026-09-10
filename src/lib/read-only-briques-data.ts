import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildEvent } from "@/app/enfant/view/child-dashboard";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";
import type { ProfileMember, ProfileTeam } from "@/app/benevole/view/profile-sections";

// Extrait de /benevole/view/page.tsx (retour de Cindy du 10/09, "Accès
// Commissions & Administration") : /commission/[token] a exactement besoin
// des mêmes données en lecture seule, gouvernées par les mêmes briques
// (voir access-briques.ts) — même fonction plutôt que deux copies du même
// bloc, pour ne devoir corriger un bug qu'à UN seul endroit (même principe
// que matchesTeamFilter dans calendar-view.tsx).
export type ReadOnlyBriquesData = {
  profileTeams: ProfileTeam[];
  profileMembers: ProfileMember[];
  profileEvents: ChildEvent[];
  profileSponsors: SponsorDisplay[];
  profileClubReports: ClubReport[];
};

export async function getReadOnlyBriquesData(
  supabase: SupabaseClient,
  allowedBriques: string[]
): Promise<ReadOnlyBriquesData> {
  const has = (b: string) => allowedBriques.includes(b);

  let profileTeams: ProfileTeam[] = [];
  let profileMembers: ProfileMember[] = [];
  let profileEvents: ChildEvent[] = [];
  let profileSponsors: SponsorDisplay[] = [];
  let profileClubReports: ClubReport[] = [];

  if (has("equipes")) {
    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name, category, sort_order")
      .order("sort_order", { ascending: true });
    const teamIds = (teamsData ?? []).map((t) => t.id);

    const [teamPlayersRes, teamCoachesRes] = await Promise.all([
      teamIds.length > 0
        ? supabase
            .from("team_players")
            .select("team_id, players(id, first_name, last_name)")
            .in("team_id", teamIds)
        : Promise.resolve({ data: [] as { team_id: string; players: unknown }[] }),
      teamIds.length > 0
        ? supabase
            .from("team_coaches")
            .select("team_id, profiles(id, first_name, last_name)")
            .in("team_id", teamIds)
        : Promise.resolve({ data: [] as { team_id: string; profiles: unknown }[] }),
    ]);

    type PersonRow = { id: string; first_name: string | null; last_name: string | null };
    const playersByTeamId = new Map<string, PersonRow[]>();
    (teamPlayersRes.data ?? []).forEach((row) => {
      const player = row.players as unknown as PersonRow | null;
      if (!player) return;
      (playersByTeamId.get(row.team_id) ?? playersByTeamId.set(row.team_id, []).get(row.team_id)!).push(
        player
      );
    });
    const coachesByTeamId = new Map<string, PersonRow[]>();
    (teamCoachesRes.data ?? []).forEach((row) => {
      const coach = row.profiles as unknown as PersonRow | null;
      if (!coach) return;
      (coachesByTeamId.get(row.team_id) ?? coachesByTeamId.set(row.team_id, []).get(row.team_id)!).push(
        coach
      );
    });

    profileTeams = (teamsData ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      coaches: (coachesByTeamId.get(t.id) ?? []).map((c) => ({
        id: c.id,
        firstName: c.first_name,
        lastName: c.last_name,
        teamCategory: t.category,
      })),
      teammates: (playersByTeamId.get(t.id) ?? []).map((p) => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        birthDate: null,
        position: null,
        isSelf: false,
        teamCategory: t.category,
        yearStatus: null,
      })),
    }));
  }

  if (has("membres")) {
    const { data: membersData } = await supabase
      .from("players")
      .select("id, first_name, last_name, category")
      .is("archived_at", null)
      .order("last_name");
    profileMembers = (membersData ?? []).map((m) => ({
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      category: m.category,
    }));
  }

  if (has("evenements") || has("matchs_resultats")) {
    const eventsWindowStart = new Date(Date.now() - 183 * 24 * 60 * 60 * 1000).toISOString();
    const { data: eventsData } = await supabase
      .from("events")
      .select(
        "id, title, event_type, is_home, location, salle, start_time, end_time, team_id, target_team_ids, team_score, opponent_score, teams(name)"
      )
      .gte("start_time", eventsWindowStart)
      .order("start_time", { ascending: true });
    profileEvents = (eventsData ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      eventType: e.event_type,
      isHome: e.is_home,
      location: e.location,
      salle: e.salle,
      startTime: e.start_time,
      endTime: e.end_time,
      teamId: e.team_id,
      targetTeamIds: e.target_team_ids,
      teamName: (e.teams as unknown as { name: string | null } | null)?.name ?? null,
      teamScore: e.team_score,
      opponentScore: e.opponent_score,
      isPaid: false,
    }));
  }

  if (has("sponsors")) {
    const { data: sponsorsData } = await supabase
      .from("sponsor_display")
      .select("id, name, logo_url, website_url")
      .order("sort_order", { ascending: true });
    profileSponsors = (sponsorsData ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      logoUrl: s.logo_url,
      websiteUrl: s.website_url,
    }));
  }

  if (has("compte_rendu_mairies") || has("compte_rendu_bureau") || has("compte_rendu_coachs")) {
    const { data: clubReportsData } = await supabase
      .from("club_reports")
      .select("id, category, title, report_date, body, created_by, file_path, updated_at")
      .order("report_date", { ascending: false });
    const filePaths = (clubReportsData ?? [])
      .map((r) => r.file_path)
      .filter((p): p is string => Boolean(p));
    const authorIds = Array.from(
      new Set((clubReportsData ?? []).map((r) => r.created_by).filter((id): id is string => Boolean(id)))
    );
    const [signedUrlsResult, authorProfilesResult] = await Promise.all([
      filePaths.length > 0
        ? supabase.storage.from("club-report-files").createSignedUrls(filePaths, 3600)
        : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[] }),
      authorIds.length > 0
        ? supabase.from("profiles").select("id, first_name, last_name").in("id", authorIds)
        : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[] }),
    ]);
    const fileUrlByPath = new Map<string, string>();
    (signedUrlsResult.data ?? []).forEach((s) => {
      if (s.signedUrl && s.path) fileUrlByPath.set(s.path, s.signedUrl);
    });
    const authorNameById = new Map<string, string>();
    (authorProfilesResult.data ?? []).forEach((p) => {
      const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
      authorNameById.set(p.id, name || "Membre");
    });
    profileClubReports = (clubReportsData ?? []).map((r) => ({
      id: r.id,
      category: r.category as ClubReport["category"],
      title: r.title,
      reportDate: r.report_date,
      body: r.body,
      createdBy: r.created_by,
      authorName: r.created_by ? (authorNameById.get(r.created_by) ?? null) : null,
      filePath: r.file_path,
      fileUrl: r.file_path ? (fileUrlByPath.get(r.file_path) ?? null) : null,
      updatedAt: r.updated_at,
    }));
  }

  return { profileTeams, profileMembers, profileEvents, profileSponsors, profileClubReports };
}
