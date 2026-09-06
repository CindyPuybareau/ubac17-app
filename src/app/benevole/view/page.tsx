import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { BENEVOLE_SESSION_COOKIE, verifyBenevoleSession } from "@/lib/benevole-session";
import { getVolunteerNeedsByEventId, type VolunteerNeed } from "@/app/dashboard/event-volunteer-needs";
import type { ChildEvent } from "@/app/enfant/view/child-dashboard";
import type { ClubReport, SponsorDisplay } from "@/app/dashboard/page";
import BenevoleView, { type BenevoleEvent } from "./benevole-view";
import type { ProfileMember, ProfileTeam } from "./profile-sections";

// Toute la lecture de données vit ici, côté serveur, avec service_role
// (un bénévole n'a pas d'auth.uid(), même principe que /enfant/view/page.tsx
// — voir ce fichier pour le détail du raisonnement). BenevoleView ne reçoit
// que des props déjà calculées, en lecture seule — la seule écriture
// possible (s'inscrire/se désinscrire d'un besoin) passe par
// /api/benevole-signup, jamais par un appel Supabase direct depuis le
// navigateur.
//
// Retour de Cindy du 05/09 ("profil et bénévoles doivent être fusionnés") :
// en plus de ce qui précède, un bénévole peut avoir un access_profile_id
// (voir 20261031150000_benevoles_access_profile.sql) qui lui ouvre en
// lecture seule les mêmes briques qu'un compte Bureau restreint (voir
// admin-view.tsx, étape 3 des profils d'accès sur-mesure) -- profile-
// sections.tsx s'occupe de l'affichage, ce fichier ne fait que réunir les
// données correspondant aux briques cochées, jamais plus.
export default async function BenevoleViewPage() {
  const cookieStore = await cookies();
  const benevoleId = verifyBenevoleSession(cookieStore.get(BENEVOLE_SESSION_COOKIE)?.value);

  if (!benevoleId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Ta session a expiré. Redemande le lien au Bureau du club pour te reconnecter.
        </p>
      </div>
    );
  }

  const supabase = createServiceClient();

  const { data: benevole } = await supabase
    .from("benevoles")
    .select("id, first_name, archived_at, access_profile_id")
    .eq("id", benevoleId)
    .maybeSingle();

  if (!benevole || benevole.archived_at) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Ce lien n&apos;est plus valide. Contacte le Bureau du club.
        </p>
      </div>
    );
  }

  const { data: inviteRows } = await supabase
    .from("event_benevole_invites")
    .select("event_id")
    .eq("benevole_id", benevoleId);
  const eventIds = (inviteRows ?? []).map((r) => r.event_id as string);

  let events: BenevoleEvent[] = [];
  let volunteerNeedsByEventId: Record<string, VolunteerNeed[]> = {};

  if (eventIds.length > 0) {
    // Retour d'audit du 28/08 : sans filtre de date, un bénévole invité en
    // octobre qui ouvre son lien en mars retombait d'abord sur ces
    // rendez-vous passés (tri chronologique croissant, sans borne basse),
    // avec des boutons "Je m'en occupe" actifs pour des besoins qui n'ont
    // plus lieu d'être. Cette page n'a aucun historique à montrer (voir
    // benevole-view.tsx) : ne garder que ce qui reste à venir.
    const { data: eventRows } = await supabase
      .from("events")
      .select(
        "id, title, event_type, location, salle, start_time, end_time, teams(name)"
      )
      .in("id", eventIds)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    events = (eventRows ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      eventType: e.event_type,
      location: e.location,
      salle: e.salle,
      startTime: e.start_time,
      endTime: e.end_time,
      teamName: (e.teams as unknown as { name: string | null } | null)?.name ?? null,
    }));

    volunteerNeedsByEventId = await getVolunteerNeedsByEventId(supabase, eventIds);
  }

  // Profil d'accès sur-mesure (étape "bénévoles" du 05/09) : null/aucune
  // ligne -> allowedBriques reste vide, aucune donnée supplémentaire n'est
  // chargée ni affichée -- comportement strictement identique à avant
  // cette fonctionnalité.
  let allowedBriques: string[] = [];
  if (benevole.access_profile_id) {
    const { data: briquesData } = await supabase
      .from("access_profile_briques")
      .select("brique")
      .eq("profile_id", benevole.access_profile_id);
    allowedBriques = (briquesData ?? []).map((b) => b.brique);
  }
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
      // birthDate/position neutralisés (null) : ChildTeamTab ne les
      // affiche de toute façon jamais (voir son propre commentaire), et
      // isSelf n'a aucun sens ici -- ce n'est le "équipe perso" de
      // personne, juste la liste des équipes du club.
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
    // Champs volontairement minimaux (retour de Cindy du 05/09) : un
    // bénévole voit qui est membre et dans quelle catégorie, jamais ses
    // coordonnées, sa santé ou ses papiers -- même sans profil "membres"
    // coché, ces informations-là restent strictement réservées au Bureau.
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
    // Même fenêtre glissante que le tableau de bord Bureau/Coach/Famille
    // (page.tsx, eventsWindowStart) : 6 mois en arrière, tout l'avenir --
    // pas la peine de recharger des années d'historique pour cette vue.
    // eslint-disable-next-line react-hooks/purity
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
      // Aucun lien avec les cotisations n'est chargé pour cette vue (voir
      // plus haut) : jamais de badge "Payant" ici, même si l'événement l'est
      // réellement côté Bureau.
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

  return (
    <BenevoleView
      firstName={benevole.first_name}
      benevoleId={benevoleId}
      events={events}
      volunteerNeedsByEventId={volunteerNeedsByEventId}
      allowedBriques={allowedBriques}
      profileTeams={profileTeams}
      profileMembers={profileMembers}
      profileEvents={profileEvents}
      profileSponsors={profileSponsors}
      profileClubReports={profileClubReports}
    />
  );
}
