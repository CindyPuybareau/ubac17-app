import { redirect } from "next/navigation";
import Image from "next/image";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatFirstName, formatPersonName } from "@/lib/names";
import { EMAIL_REPLY_TO } from "@/lib/email";
import SignOutButton from "./sign-out-button";
import NotificationBell from "./notification-bell";
import RealtimeSync from "./realtime-sync";
import DashboardTabs, { type DashboardTab } from "./dashboard-tabs";
import AdminView from "./admin-view";
import type { RosterPlayer, TeamWithMembers } from "./team-manager";
import CoachView from "./coach-view";
import FamilyView from "./family-view";
import type { FamilyTeamCardData } from "./family-team-card";
import type { BirthdaySource } from "./birthdays";
import type { AutomationKey } from "./automation-settings";
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
  getEventRoleTypes,
  getEventTasksByEventId,
  getSeasonTaskTallyByTeamIds,
  type EventRoleType,
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
  // Alertes d'expiration (voir /api/cron/expiry-alerts) : dates saisies à
  // la main par le Bureau, absentes de tout import existant — le club n'a
  // jamais suivi ces échéances de façon structurée jusqu'ici.
  licenseExpiresAt: string | null;
  medicalCertificateExpiresAt: string | null;
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
  // Dernière connexion réelle de CETTE fiche (son propre compte Supabase
  // Auth, jamais celui d'un parent) — null si elle n'a pas de compte lié
  // ou ne s'est jamais connectée. Alimenté par un trigger sur
  // auth.users.last_sign_in_at (voir la migration 20260817010000).
  lastLoginAt: string | null;
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

// Transforme une ligne brute de "cotisations" (avec ses jointures players/
// collectes) en AdminCotisation — utilisé aussi bien pour la vue Bureau que
// pour la carte "Ma cotisation" côté parent, qui lisent la même table avec
// la même forme de requête.
function mapCotisationRow(
  c: {
    id: string;
    saison: string;
    prix: number | null;
    remise: number | null;
    paiement: number | null;
    statut: string | null;
    mode_paiement: string | null;
    player_id: string;
    collecte_id: string | null;
    players: unknown;
    collectes: unknown;
  },
  paymentsByCotisationId: Map<string, CotisationPayment[]>
): AdminCotisation {
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
    playerName: formatPersonName(player?.first_name, player?.last_name, "Joueur"),
    firstName: player?.first_name ?? null,
    lastName: player?.last_name ?? null,
    category: player?.category ?? null,
  };
}

export type AdminUpcomingEvent = {
  id: string;
  title: string | null;
  event_type: string | null;
  // true = domicile, false = extérieur, null = non précisé. Ne concerne
  // que les matchs (MATCH, FRIENDLY).
  isHome: boolean | null;
  // Date de la demande de présences faite par le coach, null si aucune.
  // Déclenche le bandeau "le coach attend ta réponse" côté famille.
  attendanceRequestedAt: string | null;
  // Score saisi par le coach après coup — null tant qu'il ne l'a pas
  // renseigné (jamais pour un entraînement). Deux colonnes distinctes
  // plutôt qu'un texte libre : is_home dit déjà domicile/extérieur, ces
  // deux-là disent qui a gagné.
  teamScore: number | null;
  opponentScore: number | null;
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
  // Coéquipiers ayant répondu Présent, avec leur nom — pour le module "Qui
  // sera là ?" de la carte d'événement. Seul le bloc Famille (le seul
  // endroit où "vue Parent/Joueur" a du sens) le renseigne : undefined
  // ailleurs (Bureau, Coach) plutôt qu'un tableau vide, pour que la carte
  // sache distinguer "personne n'a encore répondu" de "pas concerné par
  // ce module".
  presentPlayers?: { id: string; firstName: string | null; lastName: string | null }[];
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
      // En minuscules : club_administrators.email est désormais toujours
      // stocké en minuscules (voir 20260918010000), mais user.email
      // reflète la casse tapée à l'inscription — un .eq() strict aurait pu
      // ne jamais trouver la ligne pour quelqu'un qui s'est inscrit avec
      // une majuscule, et le rendre invisible au Bureau sans aucune erreur.
      supabase
        .from("club_administrators")
        .select("role, club_function")
        .eq("email", (user.email ?? "").toLowerCase())
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
      // pending (not-yet-linked-account) coach, to merge their own
      // player-side calendar into the Coach tab (see ownTeamIds), AND to
      // give them a "Mon espace" tab even with zero children (an adult
      // player registered under their own account — Séniors, Loisirs...
      // — was previously invisible to every branch below and landed on
      // the empty "Aucun espace" message despite being validly linked).
      supabase
        .from("players")
        .select("id, first_name, last_name, category, profile_id")
        .eq("profile_id", user.id)
        .maybeSingle(),
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

  const childPlayerRows = (playerLinksResult.data ?? [])
    .map((link) => link.players as unknown as PlayerRow | null)
    .filter((p): p is PlayerRow => Boolean(p));
  // Un adulte inscrit lui-même (Séniors, Loisirs...) n'apparaît dans
  // aucune ligne parent_player : sans ce merge, il n'a ni enfant ni
  // équipe coachée ni accès Bureau, donc zéro onglet — voir le
  // commentaire sur ownPlayerRowResult plus haut.
  const ownPlayerRow = ownPlayerRowResult.data as PlayerRow | null;
  const playerRows =
    ownPlayerRow && !childPlayerRows.some((p) => p.id === ownPlayerRow.id)
      ? [...childPlayerRows, ownPlayerRow]
      : childPlayerRows;
  const players = playerRows.map((p) => ({
    id: p.id,
    name: p.first_name ? formatFirstName(p.first_name) : "Joueur",
    category: p.category,
    isSelf: p.profile_id === user.id,
  }));

  const coachedTeamIds = new Set(coachedTeams.map((t) => t.id));

  // Ces quatre requêtes ne dépendent que de valeurs déjà connues à ce stade
  // (players, coachedTeams, isAdmin/coachedTeamIds) — jamais les unes des
  // autres — donc parties en même temps plutôt qu'à la queue leu leu.
  // C'est cette chaîne de petites requêtes séquentielles, répétée à chaque
  // clic (voir router.refresh() dans toute l'appli), qui rendait chaque
  // action perceptiblement lente.
  const [
    whatsappGroupsRes,
    convocationCardsRaw,
    coachCards,
    eventRoleTypes,
  ] = await Promise.all([
    // A single query, unconditional on role: RLS already narrows the
    // result to exactly what this user may see (everything for Bureau,
    // their own team's + own memberships for a Coach, only their own
    // family's memberships for everyone else) — see
    // is_whatsapp_group_member() / is_whatsapp_group_team_coach() in the
    // whatsapp_groups migration.
    supabase
      .from("whatsapp_groups")
      .select(
        "id, name, category, team_id, invite_link, sort_order, whatsapp_group_members(player_id, players(id, first_name, last_name))"
      )
      .order("sort_order", { ascending: true }),
    // Priority zone: next convocation per linked player.
    Promise.all(
      players.map(async (p) => {
        const teamIds = await getPlayerTeamIds(supabase, p.id);
        const event = await getNextEventForTeams(supabase, teamIds);
        if (!event) return null;
        const status = await getPlayerRsvpStatus(supabase, event.id, p.id);
        return { player: p, event, status };
      })
    ),
    // Priority zone: next match status per coached team.
    Promise.all(
      coachedTeams.map(async (team) => {
        const event = await getNextEventForTeams(supabase, [team.id]);
        const roster = await getTeamRoster(supabase, team.id);
        const counts = event
          ? await getRsvpCounts(supabase, event.id, roster.length)
          : null;
        return { team, event, counts, roster };
      })
    ),
    // Catalogue des roles d organisation, commun au club et lu par les
    // trois espaces. Une seule requete, hors branche de role.
    getEventRoleTypes(supabase),
  ]);

  const convocationCards = convocationCardsRaw.filter(
    (c): c is NonNullable<typeof c> => Boolean(c)
  );

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

  // Convocation cards need the convened-players list of their own event's
  // team, for the task-assignment picker's context.
  const convocationRosterByEventId: Record<
    string,
    { id: string; name: string }[]
  > = {};

  // Les trois ne dépendent que de priorityEventIds/convocationCards, déjà
  // résolus juste au-dessus — encore un groupe qui tournait en file avant.
  const [eventTasksByEventId, carpoolOffersByEventId] = await Promise.all([
    getEventTasksByEventId(supabase, priorityEventIds),
    getCarpoolOffersByEventId(supabase, priorityEventIds),
    Promise.all(
      convocationCards.map(async (c) => {
        if (!c.event.team_id) {
          convocationRosterByEventId[c.event.id] = [];
          return;
        }
        const roster = await getTeamRoster(supabase, c.event.team_id);
        convocationRosterByEventId[c.event.id] = roster.map((p) => ({
          id: p.id,
          name: formatPersonName(p.first_name, p.last_name),
        }));
      })
    ),
  ]);

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
  // Défaut prudent : tant que le Bureau n'a pas explicitement activé un
  // envoi automatique (ou tant que la migration club_settings n'est pas
  // encore posée), les crons restent inactifs — voir /api/cron/bureau-
  // alerts et /api/cron/match-reminders.
  let adminAutomationSettings: Record<AutomationKey, boolean> = {
    match_reminder_enabled: false,
    expiry_alert_enabled: false,
    cotisation_relance_enabled: false,
  };

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
      clubSettingsRes,
    ] = await Promise.all([
      supabase
        .from("teams")
        .select(
          "id, name, category, ffbb_url, ffbb_last_synced_at, pending_coach_names, sort_order"
        )
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("category"),
      supabase
        .from("players")
        .select(
          "id, first_name, last_name, profile_id, pending_parent_email, birth_date, category, sex, registration_email, registration_phone, address, postal_code, city, secondary_email, mother_phone, father_phone, other_phones, secondary_address, license_type, membership_type, fbi_status, medical_notes, other_notes, image_rights, player_charter_accepted, parent_charter_accepted, license_number, license_expires_at, medical_certificate_expires_at, archived_at, last_child_login_at"
        )
        .order("first_name"),
      supabase
        .from("profiles")
        .select("id, first_name, last_name, phone, email, last_login_at")
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
          "id, title, event_type, is_home, location, salle, start_time, end_time, notes, attendance_requested_at, team_score, opponent_score, teams(id, name, category)"
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
      supabase
        .from("club_settings")
        .select("match_reminder_enabled, expiry_alert_enabled, cotisation_relance_enabled")
        .eq("id", true)
        .maybeSingle(),
    ]);

    const clubSettingsRow = clubSettingsRes.data as Record<AutomationKey, boolean> | null;
    adminAutomationSettings = {
      match_reminder_enabled: Boolean(clubSettingsRow?.match_reminder_enabled),
      expiry_alert_enabled: Boolean(clubSettingsRow?.expiry_alert_enabled),
      cotisation_relance_enabled: Boolean(clubSettingsRow?.cotisation_relance_enabled),
    };

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
      ffbb_last_synced_at: t.ffbb_last_synced_at,
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
    // Dernière connexion réelle (compte Supabase Auth) de CETTE fiche —
    // jamais celle d'un parent : un enfant sans compte propre (géré par PIN,
    // un mécanisme totalement séparé) n'a donc jamais de valeur ici, ce qui
    // est le comportement honnête attendu.
    const lastLoginByProfileId = new Map(
      (profilesRes.data ?? []).map((p) => [
        p.id,
        (p as { last_login_at: string | null }).last_login_at,
      ])
    );

    // Équipes coachées, rattachées au COMPTE de la fiche et non à son
    // e-mail. Une famille partage une seule adresse : rapprocher par
    // e-mail faisait hériter l'enfant des équipes de son parent coach —
    // Léonie affichait les badges de Basile, et le bouton "enregistrer"
    // ne pouvait rien retirer puisqu'elle n'a jamais eu ce rôle.
    const coachTeamsByProfileId = new Map<string, AdminMemberTeam[]>();
    (teamCoachesRes.data ?? []).forEach((tc) => {
      const team = teamsById.get(tc.team_id);
      if (!team) return;
      const list = coachTeamsByProfileId.get(tc.coach_id) ?? [];
      list.push(team);
      coachTeamsByProfileId.set(tc.coach_id, list);
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
        license_expires_at: string | null;
        medical_certificate_expires_at: string | null;
        archived_at: string | null;
        last_child_login_at: string | null;
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
        licenseExpiresAt: player.license_expires_at,
        medicalCertificateExpiresAt: player.medical_certificate_expires_at,
        archivedAt: player.archived_at,
        teams: teamsByPlayerId.get(player.id) ?? [],
        coachTeams: player.profile_id
          ? (coachTeamsByProfileId.get(player.profile_id) ?? [])
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
        // La plus récente des deux connexions possibles : compte
        // Supabase Auth classique (Parent/Coach/Bureau) OU code PIN
        // enfant (Espace Enfant) — mécanismes distincts, aucun des deux
        // n'exclut l'autre pour une même fiche.
        lastLoginAt: [
          player.profile_id ? lastLoginByProfileId.get(player.profile_id) : null,
          player.last_child_login_at,
        ]
          .filter((d): d is string => Boolean(d))
          .sort()
          .at(-1) ?? null,
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

    adminCotisations = (cotisationsRes.data ?? []).map((c) =>
      mapCotisationRow(c, paymentsByCotisationId)
    );

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
        isHome: e.is_home,
        attendanceRequestedAt: e.attendance_requested_at ?? null,
        teamScore: e.team_score ?? null,
        opponentScore: e.opponent_score ?? null,
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
  let coachOrganisationTasks: Record<string, EventTasksState> = {};
  const coachContactPhoneByPlayerId: Record<string, string> = {};
  const coachContactEmailByPlayerId: Record<string, string> = {};
  const coachMemberDetailsByPlayerId: Record<string, MemberDetail> = {};
  const coachRsvpStatusByKey: Record<string, string> = {};
  // Motif d'absence saisi par la famille, affiché sur la carte du coach.
  const coachRsvpReasonByKey: Record<string, string | null> = {};

  if (isCoach) {
    const coachedTeamIds = coachedTeams.map((t) => t.id);
    // Les deux ne dépendent pas l'une de l'autre — parties ensemble
    // plutôt qu'à la queue leu leu.
    const [taskTally, ownTeamIds] = await Promise.all([
      getSeasonTaskTallyByTeamIds(supabase, coachedTeamIds),
      // A coach who's also a registered player (players.profile_id linked
      // to their own account) gets their own team on top of the ones they
      // coach — in the calendar, and in the Équipe(s) tab, where it shows
      // up as a separate "Joueur" entry (see coachTeamRoleById below).
      ownPlayerId ? getPlayerTeamIds(supabase, ownPlayerId) : Promise.resolve([]),
    ]);
    coachTaskTallyByTeamId = taskTally;
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
            "id, title, event_type, is_home, location, salle, start_time, end_time, notes, attendance_requested_at, team_score, opponent_score, teams(id, name, category)"
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
      "id, profile_id, first_name, last_name, birth_date, category, sex, registration_email, registration_phone, address, postal_code, city, secondary_email, mother_phone, father_phone, other_phones, secondary_address, license_type, membership_type, fbi_status, medical_notes, other_notes, image_rights, player_charter_accepted, parent_charter_accepted, license_number, license_expires_at, medical_certificate_expires_at, archived_at";

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
        license_expires_at: string | null;
        medical_certificate_expires_at: string | null;
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
        licenseExpiresAt: player.license_expires_at,
        medicalCertificateExpiresAt: player.medical_certificate_expires_at,
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

    // Aucune ne dépend de l'autre — parties ensemble plutôt qu'à la queue
    // leu leu.
    const coachEventIds = (eventsRes.data ?? []).map((e) => e.id);
    const [rsvpsByEvent, coachRsvpRowsRes] = await Promise.all([
      fetchRsvpsByEvent(supabase, coachEventIds),
      coachEventIds.length > 0
        ? supabase
            .from("rsvps")
            .select("event_id, player_id, status, reason")
            .in("event_id", coachEventIds)
        : Promise.resolve({
            data: [] as {
              event_id: string;
              player_id: string;
              status: string;
              reason: string | null;
            }[],
          }),
    ]);
    const coachRsvpRows = coachRsvpRowsRes.data;
    (coachRsvpRows ?? []).forEach((r) => {
      coachRsvpStatusByKey[`${r.event_id}:${r.player_id}`] = r.status;
      coachRsvpReasonByKey[`${r.event_id}:${r.player_id}`] = r.reason ?? null;
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
          name: formatPersonName(player.first_name, player.last_name, "Joueur"),
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
        isHome: e.is_home,
        attendanceRequestedAt: e.attendance_requested_at ?? null,
        teamScore: e.team_score ?? null,
        opponentScore: e.opponent_score ?? null,
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

    // Les rôles (maillots/goûter) de TOUS les événements à venir, pas
    // seulement du prochain match : l'onglet "Planning & Rôles" les liste
    // date par date.
    const upcomingCoachEventIds = coachEvents
      .filter((e) => new Date(e.start_time).getTime() >= Date.now())
      .map((e) => e.id);
    coachOrganisationTasks = {
      ...eventTasksByEventId,
      ...(await getEventTasksByEventId(supabase, upcomingCoachEventIds)),
    };
  }

  // Parent/joueur: un seul calendrier lecture-seule + RSVP, tous enfants confondus.
  let familyEvents: AdminUpcomingEvent[] = [];
  let familyOrganisationTasks: Record<string, EventTasksState> = {};
  let familyRsvpPlayers: { id: string; name: string; teamIds: string[] }[] = [];
  const familyRsvpStatusByKey: Record<string, string> = {};
  const familyBirthdayMembers: BirthdaySource[] = [];
  const familyTeamCards: FamilyTeamCardData[] = [];
  let familyCotisations: AdminCotisation[] = [];

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
    // Levée plus haut qu'avant (ne dépend que de `players`, déjà connu) :
    // sert désormais aussi de garde pour la requête cotisations ci-dessous.
    const familyPlayerIds = players.map((p) => p.id);
    // Hissé hors du bloc teamsQueryResults ci-dessous (au lieu d'y être
    // déclaré en `const`) : la liste des présents par événement, plus bas,
    // a besoin de l'effectif complet de chaque équipe pour savoir à qui
    // rattacher un statut RSVP — pas seulement au moment où on construit
    // les cartes "Mon Équipe".
    const rosterByTeamId = new Map<
      string,
      (Person & { birthDate: string | null })[]
    >();

    // Ces trois groupes de requêtes ne dépendent que de allTeamIds /
    // familyPlayerIds, déjà connus ci-dessus — jamais les uns des autres —
    // donc partis ensemble plutôt qu'à la queue leu leu.
    const [teamsQueryResults, eventsRes, familyCotisationRes] = await Promise.all([
      allTeamIds.length > 0
        ? Promise.all([
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
          ])
        : null,
      supabase
        .from("events")
        .select(
          "id, title, event_type, is_home, location, salle, start_time, end_time, notes, attendance_requested_at, team_score, opponent_score, teams(id, name, category)"
        )
        .or(teamOrClubWideFilter(allTeamIds))
        .order("start_time", { ascending: true }),
      // Filtre explicite par player_id plutôt que de compter sur la seule
      // RLS : Cindy elle-même est Bureau ET parente, et la policy admin sur
      // cotisations laisserait passer TOUTES les lignes du club pour son
      // compte si cette requête-ci ne filtrait pas elle-même.
      familyPlayerIds.length > 0
        ? supabase
            .from("cotisations")
            .select(
              "id, saison, prix, remise, paiement, statut, mode_paiement, player_id, collecte_id, players(first_name, last_name, category, membership_type, fbi_status), collectes(id, name, type)"
            )
            .in("player_id", familyPlayerIds)
            .order("saison", { ascending: false })
        : null,
    ]);

    if (teamsQueryResults) {
      const [teamsRes, teammateRowsRes, teamCoachesRes, teamPendingCoachesRes] =
        teamsQueryResults;

      const teamsById = new Map(
        (teamsRes.data ?? []).map((t) => [t.id, t])
      );
      const seenTeammateIds = new Set<string>();
      // Un même joueur peut apparaître dans plusieurs lignes (une par
      // équipe) : accumulé à part plutôt que de ne garder que la première
      // équipe croisée, pour que le filtrage par enfant sélectionné
      // (family-view.tsx) sache qu'un joueur d'une équipe donnée reste
      // rattaché à TOUTES ses équipes, pas juste la première rencontrée.
      const teamIdsByPlayerId = new Map<string, string[]>();
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

        const teamIdsForPlayer = teamIdsByPlayerId.get(p.id) ?? [];
        teamIdsForPlayer.push(row.team_id);
        teamIdsByPlayerId.set(p.id, teamIdsForPlayer);

        if (seenTeammateIds.has(p.id)) return;
        seenTeammateIds.add(p.id);
        familyBirthdayMembers.push({
          id: p.id,
          firstName: p.first_name,
          lastName: p.last_name,
          birthDate: p.birth_date,
          category: p.category,
          teamIds: [],
        });
      });
      // teamIdsByPlayerId n'est complète qu'une fois TOUTES les lignes
      // parcourues (une deuxième équipe peut apparaître après la première
      // poussée dans familyBirthdayMembers) — renseigné dans une passe à
      // part plutôt qu'en cours de boucle.
      familyBirthdayMembers.forEach((m) => {
        m.teamIds = teamIdsByPlayerId.get(m.id) ?? [];
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

      // Les événements de chaque équipe viennent désormais de la même
      // liste que "Prochains Événements" (familyEvents, plus bas) —
      // répartis par équipe côté client dans family-view.tsx, pour que les
      // deux onglets lisent la même source plutôt que deux requêtes
      // séparées qui pourraient diverger.
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

    const eventsData = eventsRes.data;
    const eventIds = (eventsData ?? []).map((e) => e.id);
    const familyCotisationRows = familyCotisationRes?.data ?? null;

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
        isHome: e.is_home,
        attendanceRequestedAt: e.attendance_requested_at ?? null,
        teamScore: e.team_score ?? null,
        opponentScore: e.opponent_score ?? null,
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

    // Les rôles de TOUS les événements à venir, pas seulement de la
    // prochaine convocation : chaque carte du Planning porte son propre
    // panneau rôles/covoiturage (MatchTasksPanel), pas seulement celle du
    // prochain rendez-vous.
    const upcomingFamilyEventIds = familyEvents
      .filter((e) => new Date(e.start_time).getTime() >= Date.now())
      .map((e) => e.id);
    const familyCotisationIds = (familyCotisationRows ?? []).map((c) => c.id);
    // Effectif complet de toutes les équipes de la fratrie, pas seulement
    // ses propres enfants : "Qui sera là ?" doit pouvoir afficher les
    // coéquipiers ayant répondu Présent, pas juste Raphaël/Léonie. La RLS
    // (migration teammates_rsvp_visibility) ne laisse de toute façon
    // remonter que les lignes d'un coéquipier réel — ce filtre explicite
    // est une garde en plus, dans le même esprit que familyPlayerIds
    // ci-dessus pour les cotisations.
    const allRosterPlayerIds = Array.from(
      new Set(Array.from(rosterByTeamId.values()).flatMap((list) => list.map((p) => p.id)))
    );

    // Ces trois-là ne dépendent que de ce qui est déjà résolu ci-dessus,
    // mais pas les uns des autres — dernier groupe parallélisable de ce
    // bloc plutôt qu'à la queue leu leu.
    const [rsvpRowsRes, familyPaymentRes, extraFamilyTasks] = await Promise.all([
      eventIds.length > 0 && allRosterPlayerIds.length > 0
        ? supabase
            .from("rsvps")
            .select("event_id, player_id, status")
            .in("event_id", eventIds)
            .in("player_id", allRosterPlayerIds)
        : null,
      familyCotisationIds.length > 0
        ? supabase
            .from("cotisation_payments")
            .select("id, cotisation_id, amount, mode, detail, expected_cash_date, paid_at")
            .in("cotisation_id", familyCotisationIds)
            .order("paid_at", { ascending: false })
        : null,
      getEventTasksByEventId(supabase, upcomingFamilyEventIds),
    ]);

    // Statuts par équipe/événement, pour construire à la fois
    // familyRsvpStatusByKey (boutons Présent/Absent de ses propres
    // enfants — inchangé) et, juste après, le nombre et le nom des
    // coéquipiers présents sur chaque carte.
    const teammateStatusByEvent = new Map<string, Map<string, string>>();
    (rsvpRowsRes?.data ?? []).forEach((r) => {
      familyRsvpStatusByKey[`${r.event_id}:${r.player_id}`] = r.status;
      const byPlayer = teammateStatusByEvent.get(r.event_id) ?? new Map<string, string>();
      byPlayer.set(r.player_id, r.status);
      teammateStatusByEvent.set(r.event_id, byPlayer);
    });

    // Compteurs (déjà affichés en pastilles) ET liste nominative des
    // présents (nouveau) : les deux se lisent dans la même donnée, pas la
    // peine de les calculer séparément. Un événement club-wide (teamId
    // null, ex. stage d'été) n'a pas d'effectif d'équipe : ni pastille ni
    // liste, comme avant ce correctif.
    familyEvents.forEach((e) => {
      const roster = e.teamId ? (rosterByTeamId.get(e.teamId) ?? []) : [];
      const statuses = teammateStatusByEvent.get(e.id);
      let present = 0;
      let absent = 0;
      let late = 0;
      let answered = 0;
      const presentPlayers: { id: string; firstName: string | null; lastName: string | null }[] =
        [];
      roster.forEach((p) => {
        const status = statuses?.get(p.id);
        if (!status) return;
        answered += 1;
        if (status === "PRESENT") {
          present += 1;
          presentPlayers.push({ id: p.id, firstName: p.first_name, lastName: p.last_name });
        } else if (status === "ABSENT") absent += 1;
        else if (status === "LATE") late += 1;
      });
      e.rsvpCounts = { present, absent, late, pending: Math.max(0, roster.length - answered) };
      e.presentPlayers = presentPlayers;
    });

    if (familyCotisationRows) {
      const familyPaymentsByCotisationId = new Map<string, CotisationPayment[]>();
      (familyPaymentRes?.data ?? []).forEach((p) => {
        const list = familyPaymentsByCotisationId.get(p.cotisation_id) ?? [];
        list.push({
          id: p.id,
          amount: p.amount,
          mode: p.mode,
          detail: p.detail,
          expectedCashDate: p.expected_cash_date,
          paidAt: p.paid_at,
        });
        familyPaymentsByCotisationId.set(p.cotisation_id, list);
      });
      familyCotisations = familyCotisationRows.map((c) =>
        mapCotisationRow(c, familyPaymentsByCotisationId)
      );
    }

    familyOrganisationTasks = {
      ...eventTasksByEventId,
      ...extraFamilyTasks,
    };
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
          automationSettings={adminAutomationSettings}
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
          rsvpReasonByKey={coachRsvpReasonByKey}
          taskTallyByTeamId={coachTaskTallyByTeamId}
          teamRoleByTeamId={coachTeamRoleByTeamId}
          clubTeams={coachClubTeams}
          birthdayMembers={coachBirthdayMembers}
          organisationCards={coachCards}
          // Couvre le prochain match de chaque équipe ET tous les
          // événements à venir listés dans "Planning & Rôles".
          tasksByEventId={coachOrganisationTasks}
          carpoolByEventId={carpoolOffersByEventId}
          whatsappGroups={whatsappGroups}
          eventRoles={eventRoleTypes}
          ownPlayerId={ownPlayerId}
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
          tasksByEventId={familyOrganisationTasks}
          carpoolByEventId={carpoolOffersByEventId}
          whatsappGroups={whatsappGroups}
          eventRoles={eventRoleTypes}
          cotisations={familyCotisations}
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
          <div className="flex items-center gap-1">
            <NotificationBell />
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 pt-6 pb-24 sm:px-6 sm:py-10">
        <h1 className="text-2xl font-bold text-zinc-900">
          <span className="font-medium text-zinc-500">Bienvenue</span>{" "}
          <span className="text-navy">
            {profile?.first_name ? formatFirstName(profile.first_name) : user.email}
          </span>
        </h1>


      <DashboardTabs tabs={tabs} />

      {/* Cas normalement rare depuis que "Mon espace" couvre aussi un
          adulte inscrit sans enfant (voir le merge de playerRows plus
          haut) — reste un vrai cas possible : l'adresse utilisée à la
          connexion diffère de celle donnée à l'inscription. Message
          bienveillant, pas un mur : explique la cause la plus probable et
          donne un contact direct plutôt qu'un simple "demande au Bureau"
          sans piste ni lien. */}
      {tabs.length === 0 && (
        <div className="rounded-2xl border border-zinc-100 bg-white p-5 text-sm text-zinc-600 shadow-sm">
          <p className="font-semibold text-zinc-900">
            Ton espace n&apos;est pas encore relié à ton compte.
          </p>
          <p className="mt-2">
            C&apos;est généralement parce que l&apos;adresse email utilisée ici (
            <span className="font-medium text-zinc-800">{user.email}</span>)
            diffère de celle donnée lors de l&apos;inscription au club. Rien
            d&apos;inquiétant : le Bureau peut relier ton compte en quelques
            secondes depuis sa fiche.
          </p>
          <a
            href={`mailto:${EMAIL_REPLY_TO}?subject=${encodeURIComponent(
              "Mon espace UBAC n'est pas relié"
            )}&body=${encodeURIComponent(
              `Bonjour,\n\nMon compte (${user.email}) n'affiche aucun espace après connexion. Merci de le relier à ma fiche.\n\nMerci !`
            )}`}
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-navy px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-dark"
          >
            <Mail className="h-3.5 w-3.5 shrink-0" />
            Contacter le Bureau
          </a>
        </div>
      )}
      </div>
    </div>
  );
}
