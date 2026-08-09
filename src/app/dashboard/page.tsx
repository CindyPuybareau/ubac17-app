import { redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import RealtimeSync from "./realtime-sync";
import DashboardTabs, { type DashboardTab } from "./dashboard-tabs";
import AdminView from "./admin-view";
import type { RosterPlayer, TeamWithMembers } from "./team-manager";
import CoachView from "./coach-view";
import FamilyView from "./family-view";
import type { FamilyTeamCardData } from "./family-team-card";
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

export type WhatsAppGroup = {
  id: string;
  name: string;
  category: "EQUIPE" | "COMMISSION";
  teamId: string | null;
  inviteLink: string | null;
  sortOrder: number;
  // Whether the CURRENT user (Bureau, or the coach of this group's team)
  // may edit the invite link and membership — computed server-side since
  // RLS already narrows which groups appear at all.
  canManage: boolean;
  members: { id: string; firstName: string | null; lastName: string | null }[];
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
  // Teams this member also coaches, detected by matching their contact
  // email against a coach account's email — display-only (see the Membres
  // table's "Coach" badges), doesn't grant or reflect any actual access.
  coachTeams: AdminMemberTeam[];
  // This player's own login account, if any (players.profile_id) — lets the
  // Bureau manage that account's Coach/Bureau roles from the member modal.
  profileId: string | null;
  // This member's role in club_administrators (Bureau access), or null if
  // they have none. The specific label (Président, Trésorier...) is
  // stored in club_administrators.club_function; any non-null value
  // grants Bureau access today, ahead of finer-grained permissions.
  bureauRole: string | null;
  // Teams this member's own player row is designated to coach before they
  // have a real account (team_pending_coaches) — display-only, mirrors
  // the free-text pending_coach_names shown on team cards.
  pendingCoachTeams: AdminMemberTeam[];
};

export type CollecteType = "STAGE" | "EVENEMENT" | "BOUTIQUE";

export type AdminCollecte = {
  id: string;
  name: string;
  type: CollecteType;
  prix: number | null;
};

// Default season price per team category (Bureau-editable, see
// category-tariffs-editor.tsx) — feeds the DB trigger that auto-creates a
// cotisation row when a member is created or assigned to a team.
export type AdminCategoryTariff = {
  category: string;
  prix: number;
};

export type CotisationPayment = {
  id: string;
  amount: number;
  mode: string;
  detail: string | null;
  expectedCashDate: string | null;
  paidAt: string;
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
  firstName: string | null;
  lastName: string | null;
  category: string | null;
  playerId: string;
  membershipType: string | null;
  fbiStatus: string | null;
  collecteId: string | null;
  collecteType: CollecteType | null;
  collecteName: string | null;
  payments: CotisationPayment[];
};

export type AdminUpcomingEvent = {
  id: string;
  title: string | null;
  event_type: string | null;
  location: string | null;
  salle: string | null;
  start_time: string;
  end_time: string | null;
  notes: string | null;
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

  const [profileResult, adminResult, coachResult, playerLinksResult, ownPlayerRowResult] =
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
        .select(
          "teams(id, name, category, ffbb_url, sort_order, pending_coach_names)"
        )
        .eq("coach_id", user.id),
      supabase
        .from("parent_player")
        .select("players(id, first_name, last_name, category, profile_id)")
        .eq("parent_id", user.id),
      // This user's own player row, if any (players.profile_id = user.id) —
      // reused below both to also surface teams where THEY are only a
      // pending (not-yet-linked-account) coach, and later to merge their
      // own player-side calendar into the Coach tab (see ownTeamIds).
      supabase.from("players").select("id").eq("profile_id", user.id).maybeSingle(),
    ]);

  const profile = profileResult.data;
  const isAdmin = Boolean(adminResult.data);
  const clubFunction = adminResult.data?.club_function ?? null;
  const ownPlayerId = ownPlayerRowResult.data?.id ?? null;

  type CoachedTeam = {
    id: string;
    name: string | null;
    category: string | null;
    ffbb_url: string | null;
    sort_order: number | null;
    pending_coach_names: string | null;
  };

  // A coach assignment made from a member's fiche lands in team_coaches
  // (coach_id = profiles.id) when that member's player row was already
  // linked to a real account at the time, or in team_pending_coaches
  // (player_id-keyed) otherwise — see member-detail-modal.tsx's handleSave.
  // If this user's own player row wasn't linked yet when they were assigned
  // as coach of a team, that assignment would only show up here, so it
  // must be merged in too, or the whole Coach tab (and every team they
  // coach) would silently stay invisible to them despite being a real,
  // designated coach.
  const pendingCoachResult = ownPlayerId
    ? await supabase
        .from("team_pending_coaches")
        .select(
          "teams(id, name, category, ffbb_url, sort_order, pending_coach_names)"
        )
        .eq("player_id", ownPlayerId)
    : { data: [] as { teams: unknown }[] };

  const seenCoachedTeamIds = new Set<string>();
  const coachedTeams = [
    ...(coachResult.data ?? []),
    ...(pendingCoachResult.data ?? []),
  ]
    .map((row) => row.teams as unknown as CoachedTeam | null)
    .filter((t): t is CoachedTeam => Boolean(t))
    .filter((t) => {
      if (seenCoachedTeamIds.has(t.id)) return false;
      seenCoachedTeamIds.add(t.id);
      return true;
    })
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
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

  const coachedTeamIds = new Set(coachedTeams.map((t) => t.id));

  // A single query, unconditional on role: RLS already narrows the result
  // to exactly what this user may see (everything for Bureau, their own
  // team's + own memberships for a Coach, only their own family's
  // memberships for everyone else) — see is_whatsapp_group_member() /
  // is_whatsapp_group_team_coach() in the whatsapp_groups migration.
  const whatsappGroupsRes = await supabase
    .from("whatsapp_groups")
    .select(
      "id, name, category, team_id, invite_link, sort_order, whatsapp_group_members(player_id, players(id, first_name, last_name))"
    )
    .order("sort_order", { ascending: true });

  type WhatsAppGroupRow = {
    id: string;
    name: string;
    category: string;
    team_id: string | null;
    invite_link: string | null;
    sort_order: number;
    whatsapp_group_members: {
      player_id: string;
      players: { id: string; first_name: string | null; last_name: string | null } | null;
    }[];
  };

  const whatsappGroups: WhatsAppGroup[] = (
    (whatsappGroupsRes.data ?? []) as unknown as WhatsAppGroupRow[]
  ).map((g) => ({
    id: g.id,
    name: g.name,
    category: g.category === "COMMISSION" ? "COMMISSION" : "EQUIPE",
    teamId: g.team_id,
    inviteLink: g.invite_link,
    sortOrder: g.sort_order,
    canManage: isAdmin || (g.team_id !== null && coachedTeamIds.has(g.team_id)),
    members: g.whatsapp_group_members
      .map((m) => m.players)
      .filter((p): p is { id: string; first_name: string | null; last_name: string | null } =>
        Boolean(p)
      )
      .map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name })),
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
  let adminCategoryTariffs: AdminCategoryTariff[] = [];
  let adminUpcomingEvents: AdminUpcomingEvent[] = [];
  let adminMembers: AdminMember[] = [];
  // The Membres table's team pickers (filter + "Modifier le profil") only
  // offer teams with a sort_order set — any future leftover/legacy import
  // row without one is excluded here (though still visible in the
  // Équipes tab) until it's renamed into the canonical order, the same
  // way z.Sénior/U18/U13 became Séniors M/U18M/U13M.
  let canonicalTeamRefs: AdminMemberTeam[] = [];
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
      clubAdminsRes,
      teamPendingCoachesRes,
      cotisationPaymentsRes,
      categoryTariffsRes,
    ] = await Promise.all([
      supabase
        .from("teams")
        .select(
          "id, name, category, ffbb_url, pending_coach_names, sort_order"
        )
        .order("sort_order", { ascending: true, nullsFirst: false })
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
        .select(
          "id, title, event_type, location, salle, start_time, end_time, notes, teams(id, name, category)"
        )
        .order("start_time", { ascending: true }),
      supabase.from("parent_player").select("parent_id, player_id"),
      supabase.from("club_administrators").select("email, club_function"),
      supabase.from("team_pending_coaches").select("team_id, player_id"),
      supabase
        .from("cotisation_payments")
        .select("id, cotisation_id, amount, mode, detail, expected_cash_date, paid_at")
        .order("paid_at", { ascending: false }),
      supabase.from("category_tariffs").select("category, prix").order("category"),
    ]);

    const bureauRoleByEmailLower = new Map(
      (
        clubAdminsRes.data as
          | { email: string; club_function: string | null }[]
          | null
          ?? []
      ).map((a) => [a.email.trim().toLowerCase(), a.club_function ?? "Membre du Bureau"])
    );

    const playersById = new Map(
      (playersRes.data ?? []).map((p) => [
        p.id,
        p as Person & { birth_date: string | null },
      ])
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
        birthDate: player.birth_date,
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

    // Same source of truth as the Membres table's amber "en attente" Coach
    // badge (team_pending_coaches), just grouped the other way round (by
    // team instead of by player) so the Équipes tab's Coach section can
    // show these named-but-not-yet-linked coaches too, instead of relying
    // on the separate, no-longer-kept-in-sync teams.pending_coach_names
    // free-text column.
    const pendingCoachesByTeam = new Map<string, Person[]>();
    (teamPendingCoachesRes.data ?? []).forEach((tpc) => {
      const player = playersById.get(tpc.player_id);
      if (!player) return;
      const list = pendingCoachesByTeam.get(tpc.team_id) ?? [];
      list.push(player);
      pendingCoachesByTeam.set(tpc.team_id, list);
    });

    adminTeams = (teamsRes.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      ffbb_url: t.ffbb_url,
      players: rosterByTeam.get(t.id) ?? [],
      coaches: coachesByTeam.get(t.id) ?? [],
      pendingCoaches: pendingCoachesByTeam.get(t.id) ?? [],
      pendingCoachNames: t.pending_coach_names,
    }));
    allProfilesForAdmin = profilesRes.data ?? [];
    canonicalTeamRefs = (teamsRes.data ?? [])
      .filter((t) => t.sort_order !== null)
      .map((t) => ({ id: t.id, name: t.name, category: t.category }));

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

    // Display-only: teams coached by whoever shares this email, so a member
    // who's both a player and a coach (e.g. Basile) shows both badges in the
    // Membres table. Doesn't grant access — actual coach rights are still
    // only ever set via team_coaches (Équipes tab).
    const coachTeamsByEmailLower = new Map<string, AdminMemberTeam[]>();
    (teamCoachesRes.data ?? []).forEach((tc) => {
      const email = emailByProfileId.get(tc.coach_id);
      const team = teamsById.get(tc.team_id);
      if (!email || !team) return;
      const key = email.trim().toLowerCase();
      const list = coachTeamsByEmailLower.get(key) ?? [];
      list.push(team);
      coachTeamsByEmailLower.set(key, list);
    });

    // Display-only: named coaches without a real account yet, designated
    // directly on their own player row via team_pending_coaches — a
    // many-to-many join (mirroring team_coaches) since a team can have
    // more than one pending co-coach.
    const pendingCoachTeamsByPlayerId = new Map<string, AdminMemberTeam[]>();
    (teamPendingCoachesRes.data ?? []).forEach((tpc) => {
      const team = teamsById.get(tpc.team_id);
      if (!team) return;
      const list = pendingCoachTeamsByPlayerId.get(tpc.player_id) ?? [];
      list.push(team);
      pendingCoachTeamsByPlayerId.set(tpc.player_id, list);
    });

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
      // This row's own registration_email — the field the Bureau edits per
      // member — must win over a linked account's email, for the same
      // reason as phone below: for a child, contactProfileId resolves to
      // the PARENT's account, so favoring it would shadow an email that
      // is genuinely the child's own (e.g. Léonie has her own email,
      // distinct from her parent's login) behind the parent's address.
      const memberEmail =
        player.registration_email ??
        (contactProfileId ? emailByProfileId.get(contactProfileId) : null) ??
        null;
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
        coachTeams: memberEmail
          ? (coachTeamsByEmailLower.get(memberEmail.trim().toLowerCase()) ?? [])
          : [],
        bureauRole: memberEmail
          ? (bureauRoleByEmailLower.get(memberEmail.trim().toLowerCase()) ?? null)
          : null,
        pendingCoachTeams: pendingCoachTeamsByPlayerId.get(player.id) ?? [],
        email: memberEmail,
        phone:
          player.registration_phone ??
          (contactProfileId ? phoneByProfileId.get(contactProfileId) : null) ??
          player.mother_phone ??
          player.father_phone,
        hasParent: parentIds.length > 0,
        pendingParentEmail: player.pending_parent_email,
        profileId: player.profile_id,
      };
    });

    const rsvpsByEvent = await fetchRsvpsByEvent(
      supabase,
      (upcomingEventsRes.data ?? []).map((e) => e.id)
    );

    // paid_at desc order from the query above is preserved here (most
    // recent payment first per cotisation), which is what the payment
    // history list in the "Enregistrer un paiement" modal wants to show.
    const paymentsByCotisationId = new Map<string, CotisationPayment[]>();
    (cotisationPaymentsRes.data ?? []).forEach((p) => {
      const list = paymentsByCotisationId.get(p.cotisation_id) ?? [];
      list.push({
        id: p.id,
        amount: p.amount,
        mode: p.mode,
        detail: p.detail,
        expectedCashDate: p.expected_cash_date,
        paidAt: p.paid_at,
      });
      paymentsByCotisationId.set(p.cotisation_id, list);
    });

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
        payments: paymentsByCotisationId.get(c.id) ?? [],
        membershipType: player?.membership_type ?? null,
        fbiStatus: player?.fbi_status ?? null,
        collecteId: c.collecte_id,
        collecteType: collecte?.type ?? null,
        collecteName: collecte?.name ?? null,
        playerName:
          [player?.first_name, player?.last_name].filter(Boolean).join(" ") ||
          "Joueur",
        firstName: player?.first_name ?? null,
        lastName: player?.last_name ?? null,
        category: player?.category ?? null,
      };
    });

    adminCollectes = (collectesRes.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type as CollecteType,
      prix: c.prix,
    }));

    adminCategoryTariffs = (categoryTariffsRes.data ?? []).map((t) => ({
      category: t.category,
      prix: t.prix,
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
        salle: e.salle,
        start_time: e.start_time,
        end_time: e.end_time,
        notes: e.notes,
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
  let coachTeamRoleByTeamId: Record<string, "COACH" | "PLAYER"> = {};
  let coachClubTeams: AdminMemberTeam[] = [];
  const coachContactPhoneByPlayerId: Record<string, string> = {};
  const coachContactEmailByPlayerId: Record<string, string> = {};
  const coachMemberDetailsByPlayerId: Record<string, MemberDetail> = {};
  const coachRsvpStatusByKey: Record<string, string> = {};
  let coachArchivedPlayerIds: string[] = [];

  if (isCoach) {
    const coachedTeamIds = coachedTeams.map((t) => t.id);
    coachTaskTallyByTeamId = await getSeasonTaskTallyByTeamIds(
      supabase,
      coachedTeamIds
    );

    // A coach who's also a registered player (players.profile_id linked to
    // their own account) gets their own team on top of the ones they
    // coach — in the calendar, and in the Équipe(s) tab, where it shows up
    // as a separate "Joueur" entry (see coachTeamRoleById below).
    const ownTeamIds = ownPlayerId ? await getPlayerTeamIds(supabase, ownPlayerId) : [];
    const coachCalendarTeamIds = Array.from(
      new Set([...coachedTeamIds, ...ownTeamIds])
    );
    const ownOnlyTeamIds = ownTeamIds.filter((id) => !coachedTeamIds.includes(id));

    const [
      teamPlayersRes,
      teamCoachesRes,
      teamPendingCoachesRes,
      eventsRes,
      ownTeamsRes,
      allClubTeamsRes,
    ] = await Promise.all([
        supabase
          .from("team_players")
          .select("team_id, player_id, jersey_number, position")
          .in("team_id", coachCalendarTeamIds),
        supabase
          .from("team_coaches")
          .select("team_id, coach_id")
          .in("team_id", coachCalendarTeamIds),
        supabase
          .from("team_pending_coaches")
          .select("team_id, player_id")
          .in("team_id", coachCalendarTeamIds),
        supabase
          .from("events")
          .select(
            "id, title, event_type, location, salle, start_time, end_time, notes, teams(id, name, category)"
          )
          .or(teamOrClubWideFilter(coachCalendarTeamIds))
          .order("start_time", { ascending: true }),
        ownOnlyTeamIds.length > 0
          ? supabase
              .from("teams")
              .select("id, name, category, ffbb_url, sort_order, pending_coach_names")
              .in("id", ownOnlyTeamIds)
          : Promise.resolve({ data: [] as CoachedTeam[] }),
        // Every club team, for the "Changer d'équipe" picker — teams is
        // readable by anyone (policy `using (true)`), and legacy rows
        // without a sort_order are filtered out like everywhere else.
        supabase
          .from("teams")
          .select("id, name, category, sort_order")
          .not("sort_order", "is", null)
          .order("sort_order"),
      ]);

    // Coached teams first, then the ones they only play in — each keeps
    // the club's canonical order within its own group.
    const coachTeamRoleById: Record<string, "COACH" | "PLAYER"> = {};
    coachedTeams.forEach((t) => {
      coachTeamRoleById[t.id] = "COACH";
    });
    const ownOnlyTeams = ((ownTeamsRes.data ?? []) as CoachedTeam[]).sort(
      (a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)
    );
    ownOnlyTeams.forEach((t) => {
      coachTeamRoleById[t.id] = "PLAYER";
    });
    const coachAllTeams = [...coachedTeams, ...ownOnlyTeams];
    coachTeamRoleByTeamId = coachTeamRoleById;
    coachClubTeams = (allClubTeamsRes.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
    }));

    const pendingCoachPlayerIds = Array.from(
      new Set((teamPendingCoachesRes.data ?? []).map((r) => r.player_id))
    );
    // A pending co-coach's player row might not itself be on any coached
    // team's roster, so it wouldn't already be covered by playerIds below —
    // fetch both in one go.
    const playerIds = Array.from(
      new Set([
        ...(teamPlayersRes.data ?? []).map((r) => r.player_id),
        ...pendingCoachPlayerIds,
      ])
    );
    const coachIds = Array.from(
      new Set((teamCoachesRes.data ?? []).map((r) => r.coach_id))
    );

    const playerColumns =
      "id, profile_id, first_name, last_name, birth_date, category, sex, registration_email, registration_phone, address, postal_code, city, secondary_email, mother_phone, father_phone, other_phones, secondary_address, license_type, membership_type, fbi_status, medical_notes, other_notes, image_rights, player_charter_accepted, parent_charter_accepted, license_number, archived_at";

    const [playersRes, coachProfilesRes, parentPlayerRes, coachFichesRes] =
      await Promise.all([
        playerIds.length > 0
          ? supabase.from("players").select(playerColumns).in("id", playerIds)
          : Promise.resolve({ data: [] as Person[] }),
        coachIds.length > 0
          ? supabase
              .from("profiles")
              .select("id, first_name, last_name, phone, email")
              .in("id", coachIds)
          : Promise.resolve({ data: [] as Person[] }),
        playerIds.length > 0
          ? supabase
              .from("parent_player")
              .select("parent_id, player_id")
              .in("player_id", playerIds)
          : Promise.resolve({ data: [] as { parent_id: string; player_id: string }[] }),
        // A coach row comes from profiles, not players, so it carries no
        // contact nor birth date on its own. Their member fiche is the one
        // whose profile_id points at their account — same record the Bureau
        // shows in Membres.
        coachIds.length > 0
          ? supabase.from("players").select(playerColumns).in("profile_id", coachIds)
          : Promise.resolve({ data: [] as Person[] }),
      ]);

    const playersById = new Map(
      (playersRes.data ?? []).map((p) => [
        p.id,
        p as Person & { birth_date: string | null },
      ])
    );
    const coachProfilesById = new Map(
      (coachProfilesRes.data ?? []).map((p) => [p.id, p as Person])
    );
    // Coordonnées du compte du coach, indexées sur son id de compte —
    // c'est la clé qu'utilise sa ligne dans le tableau d'équipe.
    (
      (coachProfilesRes.data ?? []) as unknown as {
        id: string;
        phone: string | null;
        email: string | null;
      }[]
    ).forEach((p) => {
      if (p.phone) coachContactPhoneByPlayerId[p.id] = p.phone;
      if (p.email) coachContactEmailByPlayerId[p.id] = p.email;
    });
    coachArchivedPlayerIds = (
      (playersRes.data ?? []) as unknown as { id: string; archived_at: string | null }[]
    )
      .filter((p) => p.archived_at)
      .map((p) => p.id);

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
        birthDate: player.birth_date,
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

    const pendingCoachesByTeam = new Map<string, Person[]>();
    (teamPendingCoachesRes.data ?? []).forEach((tpc) => {
      const player = playersById.get(tpc.player_id);
      if (!player) return;
      const list = pendingCoachesByTeam.get(tpc.team_id) ?? [];
      list.push(player);
      pendingCoachesByTeam.set(tpc.team_id, list);
    });

    coachTeamsWithRoster = coachAllTeams.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      ffbb_url: t.ffbb_url,
      players: rosterByTeam.get(t.id) ?? [],
      coaches: coachesByTeam.get(t.id) ?? [],
      pendingCoaches: pendingCoachesByTeam.get(t.id) ?? [],
      pendingCoachNames: t.pending_coach_names,
    }));

    // EVERY team each of these players belongs to, not just the coach's own
    // — that's what tells a player of the team apart from one lent by
    // another group, and it drives the roster's "Retirer" vs "Affecter"
    // action. Readable thanks to the "coach select all teams of own
    // players" policy.
    const { data: allMembershipsData } =
      playerIds.length > 0
        ? await supabase.from("team_players").select("team_id, player_id").in("player_id", playerIds)
        : { data: [] as { team_id: string; player_id: string }[] };
    const clubTeamById = new Map(coachClubTeams.map((t) => [t.id, t]));

    const coachTeamRefsByPlayerId = new Map<string, AdminMemberTeam[]>();
    (allMembershipsData ?? []).forEach((tp) => {
      const team =
        clubTeamById.get(tp.team_id) ?? coachAllTeams.find((t) => t.id === tp.team_id);
      if (!team) return;
      const list = coachTeamRefsByPlayerId.get(tp.player_id) ?? [];
      list.push({ id: team.id, name: team.name, category: team.category });
      coachTeamRefsByPlayerId.set(tp.player_id, list);
    });

    // Coaches have no read access to cotisations (financial/payment data
    // stays Bureau-only), so clubStatus is always null in this view.
    // Les fiches des coachs sont traitées dans la même passe, puis
    // indexées AUSSI sous l'id de leur compte : c'est cette clé-là que le
    // tableau d'équipe utilise pour une ligne Coach.
    [...(playersRes.data ?? []), ...(coachFichesRes.data ?? [])].forEach((row) => {
      const player = row as {
        id: string;
        profile_id: string | null;
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
      // Deuxième clé pour une fiche de coach : le tableau d'équipe
      // identifie une ligne Coach par l'id de son compte, pas par celui de
      // sa fiche joueur.
      if (player.profile_id) {
        coachMemberDetailsByPlayerId[player.profile_id] =
          coachMemberDetailsByPlayerId[player.id];
      }
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
        salle: e.salle,
        start_time: e.start_time,
        end_time: e.end_time,
        notes: e.notes,
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
  const familyTeamCards: FamilyTeamCardData[] = [];

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
      const [teamsRes, teammateRowsRes, teamCoachesRes, teamPendingCoachesRes, teamEventsRes] =
        await Promise.all([
          supabase
            .from("teams")
            .select("id, name, category, ffbb_url, sort_order, pending_coach_names")
            .in("id", allTeamIds),
          supabase
            .from("team_players")
            .select("team_id, players(id, first_name, last_name, birth_date, category)")
            .in("team_id", allTeamIds),
          supabase
            .from("team_coaches")
            .select("team_id, profiles(id, first_name, last_name, phone)")
            .in("team_id", allTeamIds),
          supabase
            .from("team_pending_coaches")
            .select("team_id, players(id, first_name, last_name)")
            .in("team_id", allTeamIds),
          supabase
            .from("events")
            .select("id, title, event_type, location, salle, start_time, end_time, team_id")
            .in("team_id", allTeamIds)
            .order("start_time", { ascending: true }),
        ]);

      const teamsById = new Map(
        (teamsRes.data ?? []).map((t) => [t.id, t])
      );
      const rosterByTeamId = new Map<
        string,
        (Person & { birthDate: string | null })[]
      >();
      const seenTeammateIds = new Set<string>();
      (teammateRowsRes.data ?? []).forEach((row) => {
        const p = row.players as unknown as {
          id: string;
          first_name: string | null;
          last_name: string | null;
          birth_date: string | null;
          category: string | null;
        } | null;
        if (!p) return;
        const list = rosterByTeamId.get(row.team_id) ?? [];
        list.push({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          birthDate: p.birth_date,
        });
        rosterByTeamId.set(row.team_id, list);

        if (seenTeammateIds.has(p.id)) return;
        seenTeammateIds.add(p.id);
        familyBirthdayMembers.push({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          birthDate: p.birth_date,
          category: p.category,
        });
      });

      const coachesByTeamId = new Map<
        string,
        (Person & { phone: string | null })[]
      >();
      (teamCoachesRes.data ?? []).forEach((row) => {
        const p = row.profiles as unknown as
          | (Person & { phone: string | null })
          | null;
        if (!p) return;
        const list = coachesByTeamId.get(row.team_id) ?? [];
        list.push(p);
        coachesByTeamId.set(row.team_id, list);
      });

      // Same named-but-not-yet-linked coaches shown elsewhere (Membres
      // table's amber badge, Équipes tab) — surfaced here too so a parent
      // sees who's coaching even before that coach has signed up for a
      // real account.
      const pendingCoachesByTeamId = new Map<string, Person[]>();
      (teamPendingCoachesRes.data ?? []).forEach((row) => {
        const p = row.players as unknown as Person | null;
        if (!p) return;
        const list = pendingCoachesByTeamId.get(row.team_id) ?? [];
        list.push(p);
        pendingCoachesByTeamId.set(row.team_id, list);
      });

      // Top 3 upcoming events per team, same "Prochains événements" block
      // as the Bureau/Coach Équipes tab (team-card.tsx) — teamEventsRes is
      // already ordered ascending by start_time.
      const now = Date.now();
      const eventsByTeamId = new Map<
        string,
        {
          id: string;
          title: string | null;
          event_type: string | null;
          location: string | null;
          salle: string | null;
          start_time: string;
          end_time: string | null;
        }[]
      >();
      (teamEventsRes.data ?? []).forEach((e) => {
        if (new Date(e.start_time).getTime() < now) return;
        const list = eventsByTeamId.get(e.team_id as string) ?? [];
        if (list.length >= 3) return;
        list.push({
          id: e.id,
          title: e.title,
          event_type: e.event_type,
          location: e.location,
          salle: e.salle,
          start_time: e.start_time,
          end_time: e.end_time,
        });
        eventsByTeamId.set(e.team_id as string, list);
      });

      players.forEach((p, i) => {
        playerTeamIdsList[i].forEach((teamId) => {
          const team = teamsById.get(teamId);
          if (!team) return;
          familyTeamCards.push({
            playerId: p.id,
            playerName: p.isSelf ? "Toi" : p.name,
            teamId,
            teamName: team.name,
            category: team.category,
            coaches: coachesByTeamId.get(teamId) ?? [],
            pendingCoaches: pendingCoachesByTeamId.get(teamId) ?? [],
            roster: rosterByTeamId.get(teamId) ?? [],
            events: eventsByTeamId.get(teamId) ?? [],
            ffbbUrl: team.ffbb_url,
            sortOrder: team.sort_order,
            pendingCoachNames: team.pending_coach_names,
          });
        });
      });
      familyTeamCards.sort(
        (a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999)
      );
    }

    const { data: eventsData } = await supabase
      .from("events")
      .select(
        "id, title, event_type, location, salle, start_time, end_time, notes, teams(id, name, category)"
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
        salle: e.salle,
        start_time: e.start_time,
        end_time: e.end_time,
        notes: e.notes,
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
          categoryTariffs={adminCategoryTariffs}
          upcomingEvents={adminUpcomingEvents}
          contactPhoneByPlayerId={adminContactPhoneByPlayerId}
          members={adminMembers}
          birthdayMembers={adminBirthdayMembers}
          canonicalTeamRefs={canonicalTeamRefs}
          whatsappGroups={whatsappGroups}
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
          teamRoleByTeamId={coachTeamRoleByTeamId}
          clubTeams={coachClubTeams}
          birthdayMembers={coachBirthdayMembers}
          organisationCards={coachCards}
          tasksByEventId={eventTasksByEventId}
          carpoolByEventId={carpoolOffersByEventId}
          whatsappGroups={whatsappGroups}
          archivedPlayerIds={coachArchivedPlayerIds}
        />
      ),
    });
  }

  if (players.length > 0) {
    tabs.push({
      key: "family",
      label: "Mon espace",
      content: (
        <FamilyView
          events={familyEvents}
          rsvpPlayers={familyRsvpPlayers}
          rsvpStatusByKey={familyRsvpStatusByKey}
          birthdayMembers={familyBirthdayMembers}
          teamCards={familyTeamCards}
          convocationCards={convocationCards}
          rosterByEventId={convocationRosterByEventId}
          tasksByEventId={eventTasksByEventId}
          carpoolByEventId={carpoolOffersByEventId}
          whatsappGroups={whatsappGroups}
        />
      ),
    });
  }

  return (
    <div className="flex flex-1 flex-col">
      <RealtimeSync />
      <header className="sticky top-0 z-10 bg-navy px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="UBAC" width={32} height={32} className="h-8 w-8 object-contain" priority />
            <span className="text-sm font-semibold text-white">UBAC</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-bold text-zinc-900">
          <span className="font-medium text-zinc-500">Bienvenue</span>{" "}
          <span className="text-navy">{profile?.first_name ?? user.email}</span>
        </h1>


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
