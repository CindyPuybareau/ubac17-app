import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import RealtimeSync from "./realtime-sync";
import DashboardTabs, { type DashboardTab } from "./dashboard-tabs";
import AdminView from "./admin-view";
import type { RosterPlayer, TeamWithMembers } from "./team-manager";
import CoachView from "./coach-view";
import CalendarView from "./calendar-view";
import NextConvocationCard from "./next-convocation-card";
import CoachNextMatchCard from "./coach-next-match-card";
import type { BirthdaySource } from "./birthdays";
import {
  getNextEventForTeams,
  getPlayerRsvpStatus,
  getPlayerTeamIds,
  getRsvpCounts,
  getTeamRoster,
  teamOrClubWideFilter,
} from "./family-data";
import {
  getCarpoolOffersByEventId,
  getEventTasksByEventId,
  getSeasonTaskTallyByTeamIds,
  type EventTasksState,
  type SeasonTaskTally,
} from "./event-tasks";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category: string | null;
  profile_id: string | null;
};

type Person = { id: string; first_name: string | null; last_name: string | null };

export type AdminMemberTeam = {
  id: string;
  name: string | null;
  category: string | null;
};

// Full registration record, mirroring the club's official enrollment form
// ("Suivi des Inscriptions"). Shared by the Bureau's editable member detail
// modal and the coach's read-only version.
export type MemberDetail = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  category: string | null;
  sex: string | null;
  registrationEmail: string | null;
  registrationPhone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  secondaryEmail: string | null;
  motherPhone: string | null;
  fatherPhone: string | null;
  otherPhones: string | null;
  secondaryAddress: string | null;
  licenseType: string | null;
  membershipType: string | null;
  fbiStatus: string | null;
  clubStatus: string | null;
  medicalNotes: string | null;
  otherNotes: string | null;
  imageRights: string | null;
  playerCharterAccepted: string | null;
  parentCharterAccepted: string | null;
  licenseNumber: string | null;
  teams: AdminMemberTeam[];
};

export type AdminMember = MemberDetail & {
  email: string | null;
  phone: string | null;
  hasParent: boolean;
  pendingParentEmail: string | null;
  archivedAt: string | null;
};

export type CollecteType = "STAGE" | "EVENEMENT" | "BOUTIQUE";

export type AdminCollecte = {
  id: string;
  name: string;
  type: CollecteType;
  prix: number | null;
};

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
  playerId: string;
  membershipType: string | null;
  fbiStatus: string | null;
  collecteId: string | null;
  collecteType: CollecteType | null;
  collecteName: string | null;
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

// Plain (non-component) helper so the "now" read doesn't happen inside the
// page component's own render body — matches the existing family-data.ts
// pattern of computing dates in ordinary functions, not inline in JSX/page
// logic.
function findNextEventIdByTeamId(
  eventRows: { id: string; start_time: string; teams: unknown }[]
): Map<string, string> {
  const nowTs = Date.now();
  const map = new Map<string, string>();
  eventRows.forEach((e) => {
    const team = e.teams as unknown as { id: string } | null;
    if (!team || map.has(team.id)) return;
    if (new Date(e.start_time).getTime() < nowTs) return;
    map.set(team.id, e.id);
  });
  return map;
}

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

  // Match-day parent tasks (jerseys/snacks/carpool) for every event shown
  // in the priority zone above.
  const priorityEventIds = Array.from(
    new Set(
      [
        ...convocationCards.map((c) => c.event.id),
        ...coachCards
          .map((c) => c.event?.id)
          .filter((id): id is string => Boolean(id)),
      ]
    )
  );

  const [eventTasksByEventId, carpoolOffersByEventId] = await Promise.all([
    getEventTasksByEventId(supabase, priorityEventIds),
    getCarpoolOffersByEventId(supabase, priorityEventIds),
  ]);
  const emptyEventTasks: EventTasksState = { JERSEYS: null, SNACKS: null };

  // Convocation cards need the convened-players list of their own event's
  // team, for the task-assignment picker's context.
  const convocationRosterByEventId: Record<
    string,
    { id: string; name: string }[]
  > = {};
  await Promise.all(
    convocationCards.map(async (c) => {
      if (!c.event.team_id) {
        convocationRosterByEventId[c.event.id] = [];
        return;
      }
      const roster = await getTeamRoster(supabase, c.event.team_id);
      convocationRosterByEventId[c.event.id] = roster.map((p) => ({
        id: p.id,
        name: [p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom",
      }));
    })
  );

  let adminTeams: TeamWithMembers[] = [];
  let allProfilesForAdmin: Person[] = [];
  let adminCotisations: AdminCotisation[] = [];
  let adminCollectes: AdminCollecte[] = [];
  let adminUpcomingEvents: AdminUpcomingEvent[] = [];
  let adminMembers: AdminMember[] = [];
  const adminContactPhoneByPlayerId: Record<string, string> = {};

  if (isAdmin) {
    const [
      teamsRes,
      playersRes,
      profilesRes,
      teamPlayersRes,
      teamCoachesRes,
      cotisationsRes,
      collectesRes,
      upcomingEventsRes,
      parentPlayerRes,
    ] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, category, ffbb_url")
        .order("category"),
      supabase
        .from("players")
        .select(
          "id, first_name, last_name, profile_id, pending_parent_email, birth_date, category, sex, registration_email, registration_phone, address, postal_code, city, secondary_email, mother_phone, father_phone, other_phones, secondary_address, license_type, membership_type, fbi_status, medical_notes, other_notes, image_rights, player_charter_accepted, parent_charter_accepted, license_number, archived_at"
        )
        .order("first_name"),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, phone, email")
        .order("first_name"),
      supabase
        .from("team_players")
        .select("team_id, player_id, jersey_number, position"),
      supabase.from("team_coaches").select("team_id, coach_id"),
      supabase
        .from("cotisations")
        .select(
          "id, saison, prix, remise, paiement, statut, mode_paiement, player_id, collecte_id, players(first_name, last_name, category, membership_type, fbi_status), collectes(id, name, type)"
        )
        .order("saison", { ascending: false }),
      supabase
        .from("collectes")
        .select("id, name, type, prix")
        .order("created_at", { ascending: false }),
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

    const rosterByTeam = new Map<string, RosterPlayer[]>();
    (teamPlayersRes.data ?? []).forEach((tp) => {
      const player = playersById.get(tp.player_id);
      if (!player) return;
      const list = rosterByTeam.get(tp.team_id) ?? [];
      list.push({
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        jerseyNumber: tp.jersey_number,
        position: tp.position,
        nextEventStatus: null,
      });
      rosterByTeam.set(tp.team_id, list);
    });

    // Each team's next upcoming event (upcomingEventsRes is ordered
    // ascending) drives the roster table's "Statut Présence" badge, so a
    // coach/Bureau can see at a glance who's confirmed for the next match
    // without drilling into the calendar.
    const adminNextEventIdByTeamId = findNextEventIdByTeamId(
      upcomingEventsRes.data ?? []
    );
    const adminNextEventIds = Array.from(adminNextEventIdByTeamId.values());
    const { data: adminNextEventRsvpRows } =
      adminNextEventIds.length > 0
        ? await supabase
            .from("rsvps")
            .select("player_id, status")
            .in("event_id", adminNextEventIds)
        : { data: [] as { player_id: string; status: string }[] };
    const adminNextEventStatusByPlayerId = new Map(
      (adminNextEventRsvpRows ?? []).map((r) => [r.player_id, r.status])
    );
    rosterByTeam.forEach((list) => {
      list.forEach((p) => {
        p.nextEventStatus = adminNextEventStatusByPlayerId.get(p.id) ?? null;
      });
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

    const teamsById = new Map(
      (teamsRes.data ?? []).map((t) => [
        t.id,
        { id: t.id, name: t.name, category: t.category },
      ])
    );
    const teamsByPlayerId = new Map<string, AdminMemberTeam[]>();
    (teamPlayersRes.data ?? []).forEach((tp) => {
      const team = teamsById.get(tp.team_id);
      if (!team) return;
      const list = teamsByPlayerId.get(tp.player_id) ?? [];
      list.push(team);
      teamsByPlayerId.set(tp.player_id, list);
    });
    const parentIdsByPlayerId = new Map<string, string[]>();
    (parentPlayerRes.data ?? []).forEach((pp) => {
      const list = parentIdsByPlayerId.get(pp.player_id) ?? [];
      list.push(pp.parent_id);
      parentIdsByPlayerId.set(pp.player_id, list);
    });
    const emailByProfileId = new Map(
      (profilesRes.data ?? []).map((p) => [
        p.id,
        (p as { email: string | null }).email,
      ])
    );

    // cotisationsRes is ordered by saison desc, so the first row seen per
    // player is their most recent season's club status. Skip collecte-linked
    // rows (stage/event/boutique) — those aren't the season membership.
    const clubStatusByPlayerId = new Map<string, string | null>();
    (cotisationsRes.data ?? []).forEach((c) => {
      const playerId = (c as { player_id: string | null }).player_id;
      if (!playerId || c.collecte_id || clubStatusByPlayerId.has(playerId)) return;
      clubStatusByPlayerId.set(playerId, c.statut);
    });

    adminMembers = (playersRes.data ?? []).map((row) => {
      const player = row as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        profile_id: string | null;
        pending_parent_email: string | null;
        birth_date: string | null;
        category: string | null;
        sex: string | null;
        registration_email: string | null;
        registration_phone: string | null;
        address: string | null;
        postal_code: string | null;
        city: string | null;
        secondary_email: string | null;
        mother_phone: string | null;
        father_phone: string | null;
        other_phones: string | null;
        secondary_address: string | null;
        license_type: string | null;
        membership_type: string | null;
        fbi_status: string | null;
        medical_notes: string | null;
        other_notes: string | null;
        image_rights: string | null;
        player_charter_accepted: string | null;
        parent_charter_accepted: string | null;
        license_number: string | null;
        archived_at: string | null;
      };
      // Exclude self-link rows: a self-registered adult player is linked to
      // their own parent_player row, which isn't a "parent" for display.
      const parentIds = (parentIdsByPlayerId.get(player.id) ?? []).filter(
        (pid) => pid !== player.profile_id
      );
      const contactProfileId = player.profile_id ?? parentIds[0] ?? null;
      return {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        birthDate: player.birth_date,
        category: player.category,
        sex: player.sex,
        registrationEmail: player.registration_email,
        registrationPhone: player.registration_phone,
        address: player.address,
        postalCode: player.postal_code,
        city: player.city,
        secondaryEmail: player.secondary_email,
        motherPhone: player.mother_phone,
        fatherPhone: player.father_phone,
        otherPhones: player.other_phones,
        secondaryAddress: player.secondary_address,
        licenseType: player.license_type,
        membershipType: player.membership_type,
        fbiStatus: player.fbi_status,
        clubStatus: clubStatusByPlayerId.get(player.id) ?? null,
        medicalNotes: player.medical_notes,
        otherNotes: player.other_notes,
        imageRights: player.image_rights,
        playerCharterAccepted: player.player_charter_accepted,
        parentCharterAccepted: player.parent_charter_accepted,
        licenseNumber: player.license_number,
        archivedAt: player.archived_at,
        teams: teamsByPlayerId.get(player.id) ?? [],
        // Prefer a linked account's live contact info; fall back to the
        // registration-form snapshot when no parent/self account exists yet.
        email:
          (contactProfileId ? emailByProfileId.get(contactProfileId) : null) ??
          player.registration_email,
        phone:
          (contactProfileId ? phoneByProfileId.get(contactProfileId) : null) ??
          player.registration_phone ??
          player.mother_phone ??
          player.father_phone,
        hasParent: parentIds.length > 0,
        pendingParentEmail: player.pending_parent_email,
      };
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
        membership_type: string | null;
        fbi_status: string | null;
      } | null;
      const collecte = c.collectes as unknown as {
        id: string;
        name: string;
        type: CollecteType;
      } | null;
      return {
        id: c.id,
        saison: c.saison,
        prix: c.prix,
        remise: c.remise,
        paiement: c.paiement,
        statut: c.statut,
        mode_paiement: c.mode_paiement,
        playerId: c.player_id,
        membershipType: player?.membership_type ?? null,
        fbiStatus: player?.fbi_status ?? null,
        collecteId: c.collecte_id,
        collecteType: collecte?.type ?? null,
        collecteName: collecte?.name ?? null,
        playerName:
          [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
          "Joueur",
        category: player?.category ?? null,
      };
    });

    adminCollectes = (collectesRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type as CollecteType,
      prix: c.prix,
    }));

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
        teamName: team?.name ?? "Tous les groupes",
        rsvpCounts: buildRsvpCounts(rsvpsByEvent, e.id, rosterSize),
      };
    });
  }

  let coachTeamsWithRoster: TeamWithMembers[] = [];
  let coachEvents: AdminUpcomingEvent[] = [];
  let coachRsvpPlayers: { id: string; name: string; teamIds: string[] }[] = [];
  let coachTaskTallyByTeamId: Record<string, SeasonTaskTally> = {};
  const coachContactPhoneByPlayerId: Record<string, string> = {};
  const coachContactEmailByPlayerId: Record<string, string> = {};
  const coachMemberDetailsByPlayerId: Record<string, MemberDetail> = {};
  const coachRsvpStatusByKey: Record<string, string> = {};

  if (isCoach) {
    const coachedTeamIds = coachedTeams.map((t) => t.id);
    coachTaskTallyByTeamId = await getSeasonTaskTallyByTeamIds(
      supabase,
      coachedTeamIds
    );
    const [teamPlayersRes, teamCoachesRes, eventsRes] = await Promise.all([
      supabase
        .from("team_players")
        .select("team_id, player_id, jersey_number, position")
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
        .or(teamOrClubWideFilter(coachedTeamIds))
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
            .select(
              "id, first_name, last_name, birth_date, category, sex, registration_email, registration_phone, address, postal_code, city, secondary_email, mother_phone, father_phone, other_phones, secondary_address, license_type, membership_type, fbi_status, medical_notes, other_notes, image_rights, player_charter_accepted, parent_charter_accepted, license_number"
            )
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

    const rosterByTeam = new Map<string, RosterPlayer[]>();
    (teamPlayersRes.data ?? []).forEach((tp) => {
      const player = playersById.get(tp.player_id);
      if (!player) return;
      const list = rosterByTeam.get(tp.team_id) ?? [];
      list.push({
        id: player.id,
        first_name: player.first_name,
        last_name: player.last_name,
        jerseyNumber: tp.jersey_number,
        position: tp.position,
        nextEventStatus: null,
      });
      rosterByTeam.set(tp.team_id, list);
    });

    // Same "next event per team" presence badge as the Bureau's roster.
    const coachNextEventIdByTeamId = findNextEventIdByTeamId(eventsRes.data ?? []);
    const coachNextEventIds = Array.from(coachNextEventIdByTeamId.values());
    const { data: coachNextEventRsvpRows } =
      coachNextEventIds.length > 0
        ? await supabase
            .from("rsvps")
            .select("player_id, status")
            .in("event_id", coachNextEventIds)
        : { data: [] as { player_id: string; status: string }[] };
    const coachNextEventStatusByPlayerId = new Map(
      (coachNextEventRsvpRows ?? []).map((r) => [r.player_id, r.status])
    );
    rosterByTeam.forEach((list) => {
      list.forEach((p) => {
        p.nextEventStatus = coachNextEventStatusByPlayerId.get(p.id) ?? null;
      });
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

    const coachTeamRefsByPlayerId = new Map<string, AdminMemberTeam[]>();
    (teamPlayersRes.data ?? []).forEach((tp) => {
      const team = coachedTeams.find((t) => t.id === tp.team_id);
      if (!team) return;
      const list = coachTeamRefsByPlayerId.get(tp.player_id) ?? [];
      list.push({ id: team.id, name: team.name, category: team.category });
      coachTeamRefsByPlayerId.set(tp.player_id, list);
    });

    // Coaches have no read access to cotisations (financial/payment data
    // stays Bureau-only), so clubStatus is always null in this view.
    (playersRes.data ?? []).forEach((row) => {
      const player = row as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        birth_date: string | null;
        category: string | null;
        sex: string | null;
        registration_email: string | null;
        registration_phone: string | null;
        address: string | null;
        postal_code: string | null;
        city: string | null;
        secondary_email: string | null;
        mother_phone: string | null;
        father_phone: string | null;
        other_phones: string | null;
        secondary_address: string | null;
        license_type: string | null;
        membership_type: string | null;
        fbi_status: string | null;
        medical_notes: string | null;
        other_notes: string | null;
        image_rights: string | null;
        player_charter_accepted: string | null;
        parent_charter_accepted: string | null;
        license_number: string | null;
      };
      coachMemberDetailsByPlayerId[player.id] = {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        birthDate: player.birth_date,
        category: player.category,
        sex: player.sex,
        registrationEmail: player.registration_email,
        registrationPhone: player.registration_phone,
        address: player.address,
        postalCode: player.postal_code,
        city: player.city,
        secondaryEmail: player.secondary_email,
        motherPhone: player.mother_phone,
        fatherPhone: player.father_phone,
        otherPhones: player.other_phones,
        secondaryAddress: player.secondary_address,
        licenseType: player.license_type,
        membershipType: player.membership_type,
        fbiStatus: player.fbi_status,
        clubStatus: null,
        medicalNotes: player.medical_notes,
        otherNotes: player.other_notes,
        imageRights: player.image_rights,
        playerCharterAccepted: player.player_charter_accepted,
        parentCharterAccepted: player.parent_charter_accepted,
        licenseNumber: player.license_number,
        teams: coachTeamRefsByPlayerId.get(player.id) ?? [],
      };
    });

    const parentIds = Array.from(
      new Set((parentPlayerRes.data ?? []).map((r) => r.parent_id))
    );
    const { data: parentProfiles } =
      parentIds.length > 0
        ? await supabase.from("profiles").select("id, phone, email").in("id", parentIds)
        : { data: [] as { id: string; phone: string | null; email: string | null }[] };
    const phoneByParentId = new Map(
      (parentProfiles ?? []).map((p) => [p.id, p.phone])
    );
    const emailByParentId = new Map(
      (parentProfiles ?? []).map((p) => [p.id, p.email])
    );
    (parentPlayerRes.data ?? []).forEach((pp) => {
      const phone = phoneByParentId.get(pp.parent_id);
      if (phone) coachContactPhoneByPlayerId[pp.player_id] = phone;
      const email = emailByParentId.get(pp.parent_id);
      if (email) coachContactEmailByPlayerId[pp.player_id] = email;
    });

    const rsvpsByEvent = await fetchRsvpsByEvent(
      supabase,
      (eventsRes.data ?? []).map((e) => e.id)
    );

    // Full per-player attendance map (not just aggregate counts), for the
    // Calendrier convocation list and the Entraînements "appel express".
    const coachEventIds = (eventsRes.data ?? []).map((e) => e.id);
    const { data: coachRsvpRows } =
      coachEventIds.length > 0
        ? await supabase
            .from("rsvps")
            .select("event_id, player_id, status")
            .in("event_id", coachEventIds)
        : { data: [] as { event_id: string; player_id: string; status: string }[] };
    (coachRsvpRows ?? []).forEach((r) => {
      coachRsvpStatusByKey[`${r.event_id}:${r.player_id}`] = r.status;
    });

    const coachRosterPlayerIds = Array.from(
      new Set((teamPlayersRes.data ?? []).map((tp) => tp.player_id))
    );
    coachRsvpPlayers = coachRosterPlayerIds
      .map((playerId) => {
        const player = playersById.get(playerId);
        if (!player) return null;
        return {
          id: playerId,
          name: [player.first_name, player.last_name].filter(Boolean).join(" ") || "Joueur",
          teamIds: (coachTeamRefsByPlayerId.get(playerId) ?? []).map((t) => t.id),
        };
      })
      .filter((p): p is { id: string; name: string; teamIds: string[] } => Boolean(p));

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
        teamName: team?.name ?? "Tous les groupes",
        rsvpCounts: buildRsvpCounts(rsvpsByEvent, e.id, rosterSize),
      };
    });
  }

  // Parent/joueur: un seul calendrier lecture-seule + RSVP, tous enfants confondus.
  let familyEvents: AdminUpcomingEvent[] = [];
  let familyRsvpPlayers: { id: string; name: string; teamIds: string[] }[] = [];
  const familyRsvpStatusByKey: Record<string, string> = {};
  const familyBirthdayMembers: BirthdaySource[] = [];

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
      const { data: teammateRows } = await supabase
        .from("team_players")
        .select("players(id, first_name, last_name, birth_date, category)")
        .in("team_id", allTeamIds);

      const seenTeammateIds = new Set<string>();
      (teammateRows ?? []).forEach((row) => {
        const p = row.players as unknown as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          birth_date: string | null;
          category: string | null;
        } | null;
        if (!p || seenTeammateIds.has(p.id)) return;
        seenTeammateIds.add(p.id);
        familyBirthdayMembers.push({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          birthDate: p.birth_date,
          category: p.category,
        });
      });
    }

    const { data: eventsData } = await supabase
      .from("events")
      .select(
        "id, title, event_type, location, start_time, teams(id, name, category)"
      )
      .or(teamOrClubWideFilter(allTeamIds))
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
        teamName: team?.name ?? "Tous les groupes",
        rsvpCounts: { present: 0, absent: 0, late: 0, pending: 0 },
      };
    });
  }

  const adminBirthdayMembers: BirthdaySource[] = isAdmin
    ? adminMembers
        .filter((m) => !m.archivedAt)
        .map((m) => ({
          id: m.id,
          firstName: m.firstName,
          lastName: m.lastName,
          birthDate: m.birthDate,
          category: m.category,
        }))
    : [];

  const coachBirthdayMembers: BirthdaySource[] = isCoach
    ? Object.values(coachMemberDetailsByPlayerId).map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        birthDate: m.birthDate,
        category: m.category,
      }))
    : [];

  const showWidgetsZone = isAdmin || isCoach || players.length > 0;

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
          collectes={adminCollectes}
          upcomingEvents={adminUpcomingEvents}
          contactPhoneByPlayerId={adminContactPhoneByPlayerId}
          members={adminMembers}
          birthdayMembers={adminBirthdayMembers}
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
          contactEmailByPlayerId={coachContactEmailByPlayerId}
          memberDetailsByPlayerId={coachMemberDetailsByPlayerId}
          rsvpPlayers={coachRsvpPlayers}
          rsvpStatusByKey={coachRsvpStatusByKey}
          taskTallyByTeamId={coachTaskTallyByTeamId}
          birthdayMembers={coachBirthdayMembers}
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
          birthdayMembers={familyBirthdayMembers}
        />
      ),
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <RealtimeSync />
      <header className="sticky top-0 z-10 bg-navy px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="UBAC 17" width={32} height={32} className="h-8 w-8 object-contain" priority />
            <span className="text-sm font-semibold text-white">UBAC 17</span>
          </div>
          <div className="hidden sm:block">
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 sm:py-10">
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

        {showWidgetsZone && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {convocationCards.map(({ player, event, status }) => (
              <NextConvocationCard
                key={player.id}
                playerName={player.isSelf ? "toi" : player.name}
                playerId={player.id}
                event={event}
                status={status}
                roster={convocationRosterByEventId[event.id] ?? []}
                tasks={eventTasksByEventId[event.id] ?? emptyEventTasks}
                carpool={carpoolOffersByEventId[event.id] ?? []}
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
                tasks={
                  event
                    ? (eventTasksByEventId[event.id] ?? emptyEventTasks)
                    : emptyEventTasks
                }
                carpool={event ? (carpoolOffersByEventId[event.id] ?? []) : []}
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
