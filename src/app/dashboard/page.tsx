import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { runBatched } from "@/lib/batch";
import { formatFirstName, formatPersonName } from "@/lib/names";
import { EMAIL_REPLY_TO } from "@/lib/email";
import { localDateFromParts } from "@/lib/local-date";
import NotificationBell from "./notification-bell";
import OrgChartButton from "./org-chart-button";
import AvatarUpload from "./avatar-upload";
import { MobileNavProvider } from "./mobile-nav-context";
import MobileMenuButton from "./mobile-menu-button";
import RealtimeSync from "./realtime-sync";
import DashboardTabs, { type DashboardTab } from "./dashboard-tabs";
import AdminView from "./admin-view";
import type { RosterPlayer, TeamWithMembers } from "./team-manager";
import CoachView from "./coach-view";
import FamilyView from "./family-view";
import WeekStripBanner, { type WeekStripEvent } from "./week-strip-banner";
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
  getEventRoleTypesCached,
  getEventTasksByEventId,
  getSeasonTaskTallyByTeamIds,
  type EventTasksState,
  type SeasonTaskTally,
} from "./event-tasks";
import { getVolunteerNeedsByEventId, type VolunteerNeed } from "./event-volunteer-needs";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  category: string | null;
  profile_id: string | null;
  avatar_url: string | null;
};

type Person = { id: string; first_name: string | null; last_name: string | null };

export type AdminMemberTeam = {
  id: string;
  name: string | null;
  category: string | null;
};

export type AdminPenalite = {
  id: string;
  playerId: string;
  playerName: string;
  amount: number;
  notes: string | null;
  penaliteDate: string | null;
  statut: string | null;
  paidAt: string | null;
  // Retour de Cindy du 29/08 : lien HelloAsso pour payer cette pénalité
  // précise directement depuis son espace, saisi au cas par cas par le
  // Bureau (pas de collecte générique comme pour les cotisations).
  paymentLink: string | null;
};

export type AdminSponsor = {
  id: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  renewalDate: string | null;
  notes: string | null;
};

// Bénévoles hors club (retour de Cindy du 2026-08-25) : ni joueur, ni
// Bureau, parfois parent d'un joueur, parfois pas du tout — voir la
// migration 20261027000000_benevoles.sql. Jamais de lien avec les
// cotisations ni l'effectif d'une équipe.
export type AdminBenevole = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  notes: string | null;
  accessToken: string;
  archivedAt: string | null;
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
  // Un membre archivé (parti du club) ne doit plus apparaître dans les
  // widgets "à venir" (anniversaires...) — utilisé aussi bien côté Bureau
  // que Coach, d'où sa présence sur le type de base plutôt que sur
  // AdminMember seul (un coach voyait sinon les anniversaires de joueurs
  // partis, faute de ce champ sur sa propre vue).
  archivedAt: string | null;
};

export type AdminMember = MemberDetail & {
  email: string | null;
  phone: string | null;
  hasParent: boolean;
  pendingParentEmail: string | null;
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
  // Retour de Cindy du 2026-08-25 : un événement payant créé depuis "Créer
  // un événement" (create-event-form.tsx) rattache automatiquement sa
  // collecte à l'événement, avec un lien de paiement externe affiché sur sa
  // carte — voir aussi AdminUpcomingEvent.paymentLink plus bas.
  eventId: string | null;
  eventStartTime: string | null;
  // Retour de Cindy du 29/08 ("j'aimerai voir la date de l'evenement
  // payant, quand a til lieu ?") : instantané pris à la création de la
  // collecte (create-event-form.tsx), jamais effacé si l'événement est
  // ensuite supprimé (event_id -> null) ou "Événement payant" décoché —
  // contrairement à eventStartTime ci-dessus qui dépend d'une jointure en
  // direct vers events et redevient donc null dans ces deux cas.
  eventDate: string | null;
  paymentLink: string | null;
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
  // Retour de Cindy du 2026-08-25 ("Créer un événement" -> "Événement
  // payant") : dérivé de la présence d'une collecte rattachée à cet
  // événement (collectes.event_id) — jamais stocké sur events lui-même, la
  // collecte reste la source de vérité pour le prix/suivi des paiements
  // (Cotisations -> Événements payants). paymentLink alimente le bouton
  // "Payer" affiché sur la carte ; null tant qu'il n'a pas été renseigné.
  isPaid: boolean;
  // Retour de Cindy du 2026-08-25 ("je ne peux pas modifier ce que je
  // veux") : id de la collecte + tarif, nécessaires pour préremplir et
  // mettre à jour "Événement payant" depuis le formulaire de modification
  // (voir create-event-form.tsx, editingEvent).
  collecteId: string | null;
  paidAmount: number | null;
  paymentLink: string | null;
  // Retour de Cindy du 2026-08-25 ("il faut que l'on comprenne le stage
  // concerné") : joueurs inscrits à la collecte rattachée, pour affichage
  // sur la carte (voir PaidParticipantsList, calendar-view.tsx) — jamais
  // rempli côté Enfant (pas de liste nominative de paiement dans cet
  // espace, même restriction que le reste).
  paidParticipants: { id: string; firstName: string | null; lastName: string | null }[];
  teamId: string | null;
  // Événement club réservé à quelques équipes (voir 20261012000000) —
  // null pour un événement à une seule équipe ou vraiment "Tous les
  // groupes". Sert à préremplir le sélecteur de portée en édition et à
  // afficher un badge "Équipes ciblées" au lieu de "Tous les groupes".
  targetTeamIds: string[] | null;
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
  // Bénévoles déjà invités à cet événement (retour de Cindy du 2026-08-25)
  // — préremplit la case "Bénévoles invités" en édition, voir
  // create-event-form.tsx. Bureau uniquement (allowClubWide) : []
  // ailleurs, jamais rempli côté Coach/Famille/Enfant.
  benevoleIds: string[];
};

// Un mineur ne peut jamais afficher le badge Bureau (voir bureauRole
// plus bas) : seul critère fiable, contrairement à pending_parent_email
// que l'import remplit pour tout le monde. Date de naissance absente ->
// on ne peut pas prouver qu'il s'agit d'un mineur, donc pas d'exclusion
// par défaut plutôt qu'un faux positif qui masquerait le badge de
// quelqu'un dont la fiche est juste incomplète.
function isMinor(birthDate: string | null): boolean {
  if (!birthDate) return false;
  const birth = localDateFromParts(birthDate);
  if (!birth) return false;
  // "Aujourd'hui" doit être le jour calendaire à Angoulins (Europe/Paris),
  // pas celui du serveur qui exécute ce code — Vercel tourne ses fonctions
  // en UTC. Paris étant en avance sur UTC (+1h/+2h), un `new Date()` lu tel
  // quel resterait sur "hier" pendant l'heure ou les deux qui suivent
  // minuit à Paris, retardant d'un jour le passage à la majorité de
  // quelqu'un qui fête justement son 18e anniversaire ce jour-là.
  const todayParisParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number);
  const [todayYear, todayMonth, todayDay] = todayParisParts; // month: 1-indexé ici
  let age = todayYear - birth.getFullYear();
  const hadBirthdayThisYear =
    todayMonth - 1 > birth.getMonth() ||
    (todayMonth - 1 === birth.getMonth() && todayDay >= birth.getDate());
  if (!hadBirthdayThisYear) age -= 1;
  return age < 18;
}

// "Tous les groupes" ne veut plus dire "team_id null" à lui seul depuis
// target_team_ids (20261012000000) : un événement réservé à deux équipes
// a aussi team_id null, mais concerne précisément CES équipes-là, pas tout
// le club — leur montrer "Tous les groupes" serait trompeur. teamsById
// peut être partiel (scope de la requête appelante) : un id absent est
// simplement omis plutôt que de casser l'affichage.
function resolveEventTeamName<T extends { name: string | null }>(
  team: { name: string | null } | null,
  targetTeamIds: string[] | null,
  teamsById: Map<string, T>
): string {
  if (team) return team.name ?? "Équipe";
  if (targetTeamIds && targetTeamIds.length > 0) {
    const names = targetTeamIds
      .map((id) => teamsById.get(id)?.name)
      .filter((n): n is string => Boolean(n));
    return names.length > 0 ? names.join(", ") : "Équipes sélectionnées";
  }
  return "Tous les groupes";
}

// Retour de Cindy du 2026-08-25 ("Créer un événement" -> "Événement
// payant") : events.collectes est une jointure inverse (collectes.event_id
// -> events.id), donc un tableau côté PostgREST même s'il n'y a jamais
// qu'une seule collecte par événement en pratique — on prend la première.
function resolvePaidInfo(collectes: unknown): {
  isPaid: boolean;
  collecteId: string | null;
  paidAmount: number | null;
  paymentLink: string | null;
  paidParticipants: { id: string; firstName: string | null; lastName: string | null }[];
} {
  const rows = (Array.isArray(collectes) ? collectes : collectes ? [collectes] : []) as {
    id: string;
    prix: number | null;
    payment_link: string | null;
    cotisations: unknown;
  }[];
  if (rows.length === 0) {
    return { isPaid: false, collecteId: null, paidAmount: null, paymentLink: null, paidParticipants: [] };
  }
  // Retour de Cindy du 2026-08-25 ("il faut que l'on comprenne le stage
  // concerné") : liste des joueurs inscrits à la collecte rattachée, pour
  // que la carte de l'événement affiche directement qui est concerné —
  // même jointure inverse que collectes ci-dessus, un niveau plus loin
  // (cotisations.collecte_id -> cotisations.player_id -> players).
  const cotisationRows = (Array.isArray(rows[0].cotisations) ? rows[0].cotisations : []) as {
    players: unknown;
  }[];
  const paidParticipants = cotisationRows
    .map((c) => c.players as { id: string; first_name: string | null; last_name: string | null } | null)
    .filter((p): p is { id: string; first_name: string | null; last_name: string | null } => Boolean(p))
    .map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name }));
  return {
    isPaid: true,
    collecteId: rows[0].id,
    paidAmount: rows[0].prix,
    paymentLink: rows[0].payment_link,
    paidParticipants,
  };
}

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
        .select("first_name, last_name, avatar_url")
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
        .select("players(id, first_name, last_name, category, profile_id, avatar_url)")
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
        .select("id, first_name, last_name, category, profile_id, avatar_url")
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
  // Prénom affiché dans le bandeau "Bonjour" (retour de Cindy du 26/08) :
  // profile.first_name (compte de connexion) d'abord, puis la propre fiche
  // joueur si elle existe (ownPlayerRow, cas Basile : coach dont le compte
  // n'a jamais eu de prénom renseigné, mais dont la fiche joueur si) —
  // jamais l'e-mail au bout de cette chaîne.
  const displayFirstName = profile?.first_name ?? ownPlayerRow?.first_name ?? null;
  const playerRows =
    ownPlayerRow && !childPlayerRows.some((p) => p.id === ownPlayerRow.id)
      ? [...childPlayerRows, ownPlayerRow]
      : childPlayerRows;
  const players = playerRows.map((p) => ({
    id: p.id,
    name: p.first_name ? formatFirstName(p.first_name) : "Joueur",
    category: p.category,
    isSelf: p.profile_id === user.id,
    avatarUrl: p.avatar_url,
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
    // Priority zone: next match status per coached team. event et roster
    // ne dépendent l'un de l'autre en rien (deux requêtes indépendantes
    // sur le même team.id) — seul counts a besoin des deux résolus, donc
    // lui seul reste après le couple plutôt que d'enchaîner les trois à
    // la queue leu leu (retour de Cindy du 2026-08-21 sur la lenteur au
    // chargement, même famille de correctif que les clics d'Organisation).
    Promise.all(
      coachedTeams.map(async (team) => {
        const [event, roster] = await Promise.all([
          getNextEventForTeams(supabase, [team.id]),
          getTeamRoster(supabase, team.id),
        ]);
        const counts = event
          ? await getRsvpCounts(supabase, event.id, roster.length)
          : null;
        return { team, event, counts, roster };
      })
    ),
    // Catalogue des roles d organisation, commun au club et lu par les
    // trois espaces. Version mise en cache 60s (voir getEventRoleTypesCached,
    // event-tasks.ts) : identique pour tout le monde, pas la peine de la
    // redemander à Supabase à chaque chargement.
    getEventRoleTypesCached(),
  ]);

  const convocationCards = convocationCardsRaw.filter(
    (c): c is NonNullable<typeof c> => Boolean(c)
  );

  // Le propre prochain événement du coach en tant que JOUEUR, sur une
  // équipe qu'il ne coache pas (ex. Basile, joueur Séniors 1, coach
  // U13F/U13M/U13M-1) : "Planning & Rôles" ne montrait jusqu'ici que le
  // prochain événement de chaque équipe COACHÉE, jamais le sien propre —
  // retour de Cindy du 2026-08-20, "ça devrait apparaître en premier
  // puisque c'est le prochain événement de son profil". convocationCards
  // (zone prioritaire, calculée juste au-dessus) contient déjà cette info
  // pour tout joueur lié, lui compris (voir ownPlayerRow plus haut) — pas
  // besoin d'une requête de plus, juste retrouver sa propre entrée. Rien
  // à afficher si son équipe est déjà une équipe coachée (déjà couverte
  // par sa propre carte juste au-dessus, pas de doublon).
  // Retour d'audit du 28/08 : un événement ciblant plusieurs équipes
  // précises (target_team_ids) n'a pas de team_id — la déduplication ne
  // jouait donc jamais pour ce genre d'événement, et un coach dont une
  // équipe coachée est ciblée voyait sa propre carte deux fois (sa carte
  // joueur ci-dessous + la carte de son équipe coachée juste au-dessus).
  const ownPlayerNextEvent =
    convocationCards.find(
      (c) =>
        c.player.id === ownPlayerId &&
        !(c.event.team_id && coachedTeamIds.has(c.event.team_id)) &&
        !c.event.target_team_ids?.some((id) => coachedTeamIds.has(id))
    ) ?? null;

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

  // Les deux ne dépendent que de priorityEventIds, déjà résolu juste
  // au-dessus.
  //
  // Un troisième calcul vivait ici (convocationRosterByEventId, le roster
  // de chaque carte "Prochaine convocation" de l'espace Famille) — retiré
  // avec la carte elle-même (retour de Cindy du 2026-08-23, "on simplifie
  // le visuel") : plus aucun appelant n'en avait besoin, autant ne plus
  // faire l'appel getTeamRoster correspondant à chaque chargement du
  // tableau de bord.
  const [eventTasksByEventId, carpoolOffersByEventId] = await Promise.all([
    getEventTasksByEventId(supabase, priorityEventIds),
    getCarpoolOffersByEventId(supabase, priorityEventIds),
  ]);

  let adminTeams: TeamWithMembers[] = [];
  let allProfilesForAdmin: Person[] = [];
  let adminCotisations: AdminCotisation[] = [];
  let adminCollectes: AdminCollecte[] = [];
  let adminCategoryTariffs: AdminCategoryTariff[] = [];
  let adminUpcomingEvents: AdminUpcomingEvent[] = [];
  let adminVolunteerNeedsByEventId: Record<string, VolunteerNeed[]> = {};
  let adminMembers: AdminMember[] = [];
  let adminSponsors: AdminSponsor[] = [];
  let adminBenevoles: AdminBenevole[] = [];
  let adminPenalites: AdminPenalite[] = [];
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

  // Les trois blocs ci-dessous (Bureau, Coach, Famille) tournaient jusqu'ici
  // en séquence — if (isAdmin) {...} PUIS if (isCoach) {...} PUIS
  // if (players.length > 0) {...} — alors qu'ils sont totalement
  // indépendants : aucun ne lit une variable produite par un autre (voir
  // recherche faite avant ce correctif). Un compte qui cumule plusieurs
  // rôles (Cindy elle-même : Bureau ET parente) payait donc la SOMME des
  // trois chargements au lieu du plus lent des trois — un contributeur
  // réel et évitable à la lenteur du "chargement de ton espace" sur
  // mobile (retour de Cindy du 2026-08-22). Chaque bloc est encapsulé
  // tel quel (aucune ligne de logique changée à l'intérieur) dans une
  // IIFE async assignée à une promesse, les trois promesses étant
  // attendues ensemble juste avant le premier endroit qui a besoin de
  // leur résultat (voir "await Promise.all([adminPromise..." plus bas).
  const adminPromise = (async () => {
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
      sponsorsRes,
      penalitesRes,
      benevolesRes,
      eventBenevoleInvitesRes,
    ] = await runBatched(
      [
        () =>
          supabase
            .from("teams")
            .select(
              "id, name, category, ffbb_url, ffbb_last_synced_at, pending_coach_names, sort_order"
            )
            .order("sort_order", { ascending: true, nullsFirst: false })
            .order("category"),
        () =>
          supabase
            .from("players")
            .select(
              "id, first_name, last_name, profile_id, pending_parent_email, birth_date, category, sex, registration_email, registration_phone, address, postal_code, city, secondary_email, mother_phone, father_phone, other_phones, secondary_address, license_type, membership_type, fbi_status, medical_notes, other_notes, image_rights, player_charter_accepted, parent_charter_accepted, license_number, license_expires_at, medical_certificate_expires_at, archived_at, last_child_login_at"
            )
            .order("first_name"),
        () =>
          supabase
            .from("profiles")
            .select("id, first_name, last_name, phone, email, last_login_at")
            .order("first_name"),
        () =>
          supabase
            .from("team_players")
            .select("team_id, player_id, jersey_number, position"),
        () => supabase.from("team_coaches").select("team_id, coach_id"),
        () =>
          supabase
            .from("cotisations")
            .select(
              "id, saison, prix, remise, paiement, statut, mode_paiement, player_id, collecte_id, players(first_name, last_name, category, membership_type, fbi_status), collectes(id, name, type)"
            )
            .order("saison", { ascending: false }),
        () =>
          supabase
            .from("collectes")
            .select(
              "id, name, type, prix, event_id, event_date, payment_link, events(start_time)"
            )
            .order("created_at", { ascending: false }),
        () =>
          supabase
            .from("events")
            .select(
              "id, title, event_type, is_home, location, salle, start_time, end_time, notes, attendance_requested_at, team_score, opponent_score, team_id, target_team_ids, teams(id, name, category), collectes(id, prix, payment_link, cotisations(players(id, first_name, last_name)))"
            )
            .order("start_time", { ascending: true }),
        () => supabase.from("parent_player").select("parent_id, player_id"),
        () => supabase.from("club_administrators").select("email, club_function"),
        () => supabase.from("team_pending_coaches").select("team_id, player_id"),
        () =>
          supabase
            .from("cotisation_payments")
            .select("id, cotisation_id, amount, mode, detail, expected_cash_date, paid_at")
            .order("paid_at", { ascending: false }),
        () => supabase.from("category_tariffs").select("category, prix").order("category"),
        () =>
          supabase
            .from("club_settings")
            .select("match_reminder_enabled, expiry_alert_enabled, cotisation_relance_enabled")
            .eq("id", true)
            .maybeSingle(),
        // Réservé au Bureau (voir policy "admin manage sponsors") : aucun
        // lien avec une équipe ou un joueur, pas besoin côté Coach/Famille.
        () =>
          supabase
            .from("sponsors")
            .select("id, name, contact_name, contact_email, contact_phone, renewal_date, notes")
            .order("renewal_date", { ascending: true, nullsFirst: false }),
        // Toutes les pénalités du club — le Bureau les gère toutes (onglet
        // Pénalités, à côté de Stages & Événements Payants).
        () =>
          supabase
            .from("penalites")
            .select("id, player_id, amount, notes, penalite_date, statut, paid_at, payment_link, players(first_name, last_name)")
            .order("penalite_date", { ascending: false }),
        // Bénévoles hors club (retour de Cindy du 2026-08-25) : réservé au
        // Bureau (voir policy "admin manage benevoles"), même périmètre
        // que sponsors ci-dessus.
        () =>
          supabase
            .from("benevoles")
            .select("id, first_name, last_name, phone, email, notes, access_token, archived_at")
            .order("last_name"),
        () => supabase.from("event_benevole_invites").select("event_id, benevole_id"),
      ],
      // Plafond de requêtes simultanées pour ce bloc (voir lib/batch.ts) :
      // le projet Supabase n'autorise que 15 connexions réelles au total,
      // partagées avec les blocs Coach/Famille lancés en parallèle (voir
      // adminPromise/coachPromise/familyPromise plus bas) et les autres
      // utilisateurs connectés en même temps.
      5
    );

    const clubSettingsRow = clubSettingsRes.data as Record<AutomationKey, boolean> | null;
    // Le compilateur React signale la réaffectation d'une variable de portée
    // externe depuis cette IIFE async (pensée pour un composant client qui
    // re-render) — sans objet ici : ce composant serveur exécute chaque
    // bloc une seule fois, et tout est relu seulement après le
    // "await Promise.all(...)" plus bas, jamais pendant l'exécution des
    // trois blocs en parallèle.
    // eslint-disable-next-line react-hooks/immutability
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
    // Les trois lignes ci-dessous ne dépendent que des ids déjà connus
    // (upcomingEventsRes, résolu plus haut dans le gros Promise.all) —
    // lancées ensemble ici puis attendues chacune à son point d'usage plus
    // bas, au lieu de trois allers-retours séquentiels entrecoupés de
    // calculs synchrones. Même correctif que coachPromise (Stage D),
    // creusé suite au retour de Cindy sur la lenteur de connexion.
    const upcomingEventIds = (upcomingEventsRes.data ?? []).map((e) => e.id);
    const adminNextEventRsvpPromise =
      adminNextEventIds.length > 0
        ? supabase
            .from("rsvps")
            .select("player_id, status, event_id")
            .in("event_id", adminNextEventIds)
        : Promise.resolve({ data: [] as { player_id: string; status: string; event_id: string }[] });
    const rsvpsByEventPromise = fetchRsvpsByEvent(supabase, upcomingEventIds);
    const adminVolunteerNeedsPromise = getVolunteerNeedsByEventId(supabase, upcomingEventIds);
    const { data: adminNextEventRsvpRows } = await adminNextEventRsvpPromise;
    // Clé "event_id:player_id", pas juste player_id : un joueur inscrit
    // dans deux équipes a un "prochain événement" différent pour chacune,
    // donc potentiellement deux statuts différents. Une clé par joueur
    // seul écrasait l'un des deux et affichait le même statut sur les
    // deux équipes.
    const adminNextEventStatusByKey = new Map(
      (adminNextEventRsvpRows ?? []).map((r) => [`${r.event_id}:${r.player_id}`, r.status])
    );
    rosterByTeam.forEach((list, teamId) => {
      const nextEventId = adminNextEventIdByTeamId.get(teamId);
      list.forEach((p) => {
        p.nextEventStatus = nextEventId
          ? (adminNextEventStatusByKey.get(`${nextEventId}:${p.id}`) ?? null)
          : null;
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
        // Un mineur ne peut jamais afficher le badge Bureau, même s'il
        // partage l'email d'un parent qui, lui, en a un (cas remonté : le
        // fils d'une secrétaire du Bureau, inscrit avec l'email de sa
        // mère, héritait à tort du badge). pending_parent_email ne
        // suffisait pas comme critère : l'import le remplit pour TOUT le
        // monde, adultes compris, depuis la même colonne "email" du
        // fichier — ça excluait aussi la secrétaire de son propre badge.
        // L'âge réel (date de naissance) est le seul signal fiable ici.
        bureauRole:
          memberEmail && !isMinor(player.birth_date)
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

    const rsvpsByEvent = await rsvpsByEventPromise;

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

    adminCollectes = (collectesRes.data ?? []).map((c) => {
      // Jointure directe (collectes.event_id -> events.id) : un seul objet,
      // pas un tableau, contrairement à resolvePaidInfo plus haut qui lit
      // la relation dans l'autre sens.
      const event = c.events as unknown as { start_time: string } | null;
      return {
        id: c.id,
        name: c.name,
        type: c.type as CollecteType,
        prix: c.prix,
        eventId: c.event_id ?? null,
        eventStartTime: event?.start_time ?? null,
        eventDate: c.event_date ?? null,
        paymentLink: c.payment_link ?? null,
      };
    });

    adminCategoryTariffs = (categoryTariffsRes.data ?? []).map((t) => ({
      category: t.category,
      prix: t.prix,
    }));

    adminSponsors = (sponsorsRes.data ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      contactName: s.contact_name,
      contactEmail: s.contact_email,
      contactPhone: s.contact_phone,
      renewalDate: s.renewal_date,
      notes: s.notes,
    }));

    adminBenevoles = (benevolesRes.data ?? []).map((b) => ({
      id: b.id,
      firstName: b.first_name,
      lastName: b.last_name,
      phone: b.phone,
      email: b.email,
      notes: b.notes,
      accessToken: b.access_token,
      archivedAt: b.archived_at,
    }));

    // Quels bénévoles ont déjà été invités à chaque événement (retour de
    // Cindy du 2026-08-25) — préremplit la case "Bénévoles invités" en
    // édition, voir create-event-form.tsx.
    const benevoleIdsByEventId = new Map<string, string[]>();
    (eventBenevoleInvitesRes.data ?? []).forEach((row) => {
      const list = benevoleIdsByEventId.get(row.event_id) ?? [];
      list.push(row.benevole_id);
      benevoleIdsByEventId.set(row.event_id, list);
    });

    adminPenalites = (penalitesRes.data ?? []).map((p) => {
      const player = p.players as unknown as {
        first_name: string | null;
        last_name: string | null;
      } | null;
      return {
        id: p.id,
        playerId: p.player_id,
        playerName: [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Joueur",
        amount: p.amount,
        notes: p.notes,
        penaliteDate: p.penalite_date,
        statut: p.statut,
        paidAt: p.paid_at,
        paymentLink: p.payment_link,
      };
    });

    adminUpcomingEvents = (upcomingEventsRes.data ?? []).map((e) => {
      const team = e.teams as unknown as {
        id: string;
        name: string | null;
        category: string | null;
      } | null;
      // Retour d'audit du 28/08 : un événement ciblant plusieurs équipes
      // précises (target_team_ids) n'a pas de teamId — rosterSize tombait
      // à 0, "pending" affichait 0 et le bandeau "Demander les présences"
      // croyait à tort que tout le monde avait répondu. Effectif = union
      // (dédupliquée) des rosters de toutes les équipes ciblées.
      const rosterSize = team
        ? rosterByTeam.get(team.id)?.length ?? 0
        : e.target_team_ids
          ? new Set(
              e.target_team_ids.flatMap((id: string) => (rosterByTeam.get(id) ?? []).map((p) => p.id))
            ).size
          : 0;
      const paidInfo = resolvePaidInfo(e.collectes);
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
        isPaid: paidInfo.isPaid,
        collecteId: paidInfo.collecteId,
        paidAmount: paidInfo.paidAmount,
        paymentLink: paidInfo.paymentLink,
        paidParticipants: paidInfo.paidParticipants,
        teamId: team?.id ?? null,
        targetTeamIds: e.target_team_ids ?? null,
        teamName: resolveEventTeamName(team, e.target_team_ids ?? null, teamsById),
        rsvpCounts: buildRsvpCounts(rsvpsByEvent, e.id, rosterSize),
        benevoleIds: benevoleIdsByEventId.get(e.id) ?? [],
      };
    });

    // Besoins d'organisation de TOUS les événements, passés ou à venir : le
    // panneau vit sur chaque carte du calendrier (mois entier, pas
    // seulement les prochains) — un filtre "à venir" faisait disparaître
    // les besoins d'un événement dès que son horaire était dépassé, même
    // fraîchement créé (retour de Cindy du 2026-08-19 : besoins ajoutés à
    // la création, introuvables juste après).
    adminVolunteerNeedsByEventId = await adminVolunteerNeedsPromise;
  }
  })();

  let coachTeamsWithRoster: TeamWithMembers[] = [];
  let coachEvents: AdminUpcomingEvent[] = [];
  let coachRsvpPlayers: { id: string; name: string; teamIds: string[] }[] = [];
  let coachTaskTallyByTeamId: Record<string, SeasonTaskTally> = {};
  let coachTeamRoleByTeamId: Record<string, "COACH" | "PLAYER"> = {};
  let coachClubTeams: AdminMemberTeam[] = [];
  let coachOrganisationTasks: Record<string, EventTasksState> = {};
  let coachVolunteerNeedsByEventId: Record<string, VolunteerNeed[]> = {};
  // Lecture seule (retour de Cindy du 2026-08-22) : le coach voit les
  // pénalités des joueurs de ses équipes, mais ne peut ni en créer ni en
  // modifier — seul le Bureau saisit une pénalité.
  let coachPenalites: AdminPenalite[] = [];
  const coachContactPhoneByPlayerId: Record<string, string> = {};
  const coachContactEmailByPlayerId: Record<string, string> = {};
  const coachMemberDetailsByPlayerId: Record<string, MemberDetail> = {};
  const coachRsvpStatusByKey: Record<string, string> = {};
  // Motif d'absence saisi par la famille, affiché sur la carte du coach.
  const coachRsvpReasonByKey: Record<string, string | null> = {};

  const coachPromise = (async () => {
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
    ] = await runBatched(
      [
        () =>
          supabase
            .from("team_players")
            .select("team_id, player_id, jersey_number, position")
            .in("team_id", coachCalendarTeamIds),
        () =>
          supabase
            .from("team_coaches")
            .select("team_id, coach_id")
            .in("team_id", coachCalendarTeamIds),
        () =>
          supabase
            .from("team_pending_coaches")
            .select("team_id, player_id")
            .in("team_id", coachCalendarTeamIds),
        () =>
          supabase
            .from("events")
            .select(
              "id, title, event_type, is_home, location, salle, start_time, end_time, notes, attendance_requested_at, team_score, opponent_score, team_id, target_team_ids, teams(id, name, category), collectes(id, prix, payment_link, cotisations(players(id, first_name, last_name)))"
            )
            .or(teamOrClubWideFilter(coachCalendarTeamIds))
            .order("start_time", { ascending: true }),
        () =>
          ownOnlyTeamIds.length > 0
            ? supabase
                .from("teams")
                .select("id, name, category, ffbb_url, sort_order, pending_coach_names")
                .in("id", ownOnlyTeamIds)
            : Promise.resolve({ data: [] as CoachedTeam[] }),
        // Every club team, for the "Changer d'équipe" picker — teams is
        // readable by anyone (policy `using (true)`), and legacy rows
        // without a sort_order are filtered out like everywhere else.
        () =>
          supabase
            .from("teams")
            .select("id, name, category, sort_order")
            .not("sort_order", "is", null)
            .order("sort_order"),
      ],
      // Voir lib/batch.ts / le bloc Bureau plus haut pour le contexte.
      5
    );

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

    // Retour de Cindy du 2026-08-23 : "les connexions qui sont lentes,
    // surtout celle de Basile" (coach de plusieurs équipes ET joueur —
    // exactement le profil qui traverse toutes les branches ci-dessous).
    // Cinq groupes de requêtes plus bas (coachNextEventRsvpPromise,
    // allMembershipsPromise, rsvpsByEvent/coachRsvpRows/coachPenalite,
    // coachOrganisationTasks, coachVolunteerNeedsByEventId) ne dépendaient
    // en réalité QUE de teamPlayersRes/eventsRes (déjà résolus juste
    // au-dessus) mais étaient lancées après coup, à la queue leu leu,
    // ajoutant plusieurs aller-retours réseau strictement séquentiels en
    // plus de ceux réellement nécessaires. Elles démarrent maintenant ici
    // (sans attendre) pour tourner EN MÊME TEMPS que le Promise.all
    // players/profiles/parent_player/coachFiches juste en dessous, plutôt
    // qu'après lui — seul leur `await`, plus bas, à l'endroit où le
    // résultat sert réellement, reste à sa place.
    const coachEventIds = (eventsRes.data ?? []).map((e) => e.id);
    const coachNextEventIdByTeamId = findNextEventIdByTeamId(eventsRes.data ?? []);
    const coachNextEventIds = Array.from(coachNextEventIdByTeamId.values());
    // Retour de Cindy du 2026-08-22 : Basile (coach ET joueur Séniors 1)
    // voyait sa propre pénalité apparaître sous "Pénalités de l'équipe" —
    // teamPlayersRes est scopée à coachCalendarTeamIds (équipes coachées
    // ET équipe jouée, voir plus haut, pensé pour le calendrier fusionné),
    // ce qui mélangeait l'effectif de son équipe JOUÉE dans ce filtre.
    // "Pénalités de l'équipe" doit rester strictement scopée aux équipes
    // réellement COACHÉES (sa propre pénalité comme joueur reste visible
    // via "Mes pénalités" juste au-dessus, filtrée sur ownPlayerId).
    const coachPenaliteScope = Array.from(
      new Set(
        (teamPlayersRes.data ?? [])
          .filter((tp) => coachedTeamIds.includes(tp.team_id))
          .map((tp) => tp.player_id)
      )
    );
    // Mêmes id que coachEvents.map(e => e.id)/le filtre "à venir" plus bas
    // (start_time/id ne changent pas entre la ligne brute et la version
    // enrichie) — inutile d'attendre l'enrichissement pour les calculer.
    const upcomingCoachEventIds = (eventsRes.data ?? [])
      .filter((e) => new Date(e.start_time).getTime() >= Date.now())
      .map((e) => e.id);

    const coachNextEventRsvpPromise =
      coachNextEventIds.length > 0
        ? supabase
            .from("rsvps")
            .select("player_id, status, event_id")
            .in("event_id", coachNextEventIds)
        : Promise.resolve({ data: [] as { player_id: string; status: string; event_id: string }[] });
    // EVERY team each of these players belongs to, not just the coach's own
    // — that's what tells a player of the team apart from one lent by
    // another group, and it drives the roster's "Retirer" vs "Affecter"
    // action. Readable thanks to the "coach select all teams of own
    // players" policy.
    const allMembershipsPromise =
      playerIds.length > 0
        ? supabase.from("team_players").select("team_id, player_id").in("player_id", playerIds)
        : Promise.resolve({ data: [] as { team_id: string; player_id: string }[] });
    const rsvpsByEventPromise = fetchRsvpsByEvent(supabase, coachEventIds);
    const coachRsvpRowsPromise =
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
          });
    const coachPenalitePromise =
      coachPenaliteScope.length > 0
        ? supabase
            .from("penalites")
            .select(
              "id, player_id, amount, notes, penalite_date, statut, paid_at, payment_link, players(first_name, last_name)"
            )
            .in("player_id", coachPenaliteScope)
        : Promise.resolve({ data: [] as unknown[] });
    // Les rôles (maillots/goûter) de TOUS les événements à venir, pas
    // seulement du prochain match : l'onglet "Planning & Rôles" les liste
    // date par date.
    const coachOrganisationTasksExtraPromise = getEventTasksByEventId(
      supabase,
      upcomingCoachEventIds
    );
    // Besoins d'organisation de TOUS les événements de l'équipe, pas
    // seulement ceux à venir — même raison que côté Bureau juste plus haut.
    const coachVolunteerNeedsPromise = getVolunteerNeedsByEventId(supabase, coachEventIds);

    const [playersRes, coachProfilesRes, parentPlayerRes, coachFichesRes] =
      await runBatched(
        [
          () =>
            playerIds.length > 0
              ? supabase.from("players").select(playerColumns).in("id", playerIds)
              : Promise.resolve({ data: [] as Person[] }),
          () =>
            coachIds.length > 0
              ? supabase
                  .from("profiles")
                  .select("id, first_name, last_name, phone, email")
                  .in("id", coachIds)
              : Promise.resolve({ data: [] as Person[] }),
          () =>
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
          () =>
            coachIds.length > 0
              ? supabase.from("players").select(playerColumns).in("profile_id", coachIds)
              : Promise.resolve({ data: [] as Person[] }),
        ],
        // Voir lib/batch.ts / le bloc Bureau plus haut pour le contexte.
        4
      );

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
    // (coachNextEventIdByTeamId/coachNextEventIds calculés plus haut, la
    // requête elle-même déjà lancée en parallèle — voir
    // coachNextEventRsvpPromise.)
    const { data: coachNextEventRsvpRows } = await coachNextEventRsvpPromise;
    // Voir le commentaire équivalent côté Bureau plus haut : clé par
    // (event_id, player_id), pas juste player_id, pour ne pas confondre
    // les statuts d'un joueur inscrit dans deux équipes coachées.
    const coachNextEventStatusByKey = new Map(
      (coachNextEventRsvpRows ?? []).map((r) => [`${r.event_id}:${r.player_id}`, r.status])
    );
    rosterByTeam.forEach((list, teamId) => {
      const nextEventId = coachNextEventIdByTeamId.get(teamId);
      list.forEach((p) => {
        p.nextEventStatus = nextEventId
          ? (coachNextEventStatusByKey.get(`${nextEventId}:${p.id}`) ?? null)
          : null;
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
    // another group, et pilote le "Retirer" vs "Affecter" du tableau
    // (requête déjà lancée en parallèle — voir allMembershipsPromise).
    const { data: allMembershipsData } = await allMembershipsPromise;
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
        archived_at: string | null;
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
        archivedAt: player.archived_at,
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

    // Aucune ne dépend de l'autre — et déjà lancées en parallèle plus haut
    // (voir rsvpsByEventPromise/coachRsvpRowsPromise/coachPenalitePromise),
    // ne reste ici qu'à en récupérer le résultat.
    const [rsvpsByEvent, coachRsvpRowsRes, coachPenaliteRes] = await Promise.all([
      rsvpsByEventPromise,
      coachRsvpRowsPromise,
      coachPenalitePromise,
    ]);
    coachPenalites = (
      (coachPenaliteRes.data ?? []) as unknown as {
        id: string;
        player_id: string;
        amount: number;
        notes: string | null;
        penalite_date: string | null;
        statut: string | null;
        paid_at: string | null;
        payment_link: string | null;
        players: { first_name: string | null; last_name: string | null } | null;
      }[]
    ).map((p) => ({
      id: p.id,
      playerId: p.player_id,
      playerName:
        [p.players?.first_name, p.players?.last_name].filter(Boolean).join(" ") || "Joueur",
      amount: p.amount,
      notes: p.notes,
      penaliteDate: p.penalite_date,
      statut: p.statut,
      paidAt: p.paid_at,
      paymentLink: p.payment_link,
    }));
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
      // Même correctif que le bloc Bureau ci-dessus (retour d'audit du
      // 28/08) : effectif = union dédupliquée des rosters des équipes
      // ciblées pour un événement multi-équipes (teamId null).
      const rosterSize = team
        ? rosterByTeam.get(team.id)?.length ?? 0
        : e.target_team_ids
          ? new Set(
              e.target_team_ids.flatMap((id: string) => (rosterByTeam.get(id) ?? []).map((p) => p.id))
            ).size
          : 0;
      const paidInfo = resolvePaidInfo(e.collectes);
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
        isPaid: paidInfo.isPaid,
        collecteId: paidInfo.collecteId,
        paidAmount: paidInfo.paidAmount,
        paymentLink: paidInfo.paymentLink,
        paidParticipants: paidInfo.paidParticipants,
        teamId: team?.id ?? null,
        targetTeamIds: e.target_team_ids ?? null,
        teamName: resolveEventTeamName(team, e.target_team_ids ?? null, clubTeamById),
        rsvpCounts: buildRsvpCounts(rsvpsByEvent, e.id, rosterSize),
        benevoleIds: [],
      };
    });

    // Les rôles (maillots/goûter) de TOUS les événements à venir (requête
    // déjà lancée en parallèle plus haut — voir
    // coachOrganisationTasksExtraPromise/coachVolunteerNeedsPromise).
    coachOrganisationTasks = {
      ...eventTasksByEventId,
      ...(await coachOrganisationTasksExtraPromise),
    };
    // Besoins d'organisation de TOUS les événements de l'équipe, pas
    // seulement ceux à venir — même raison que côté Bureau juste plus haut.
    coachVolunteerNeedsByEventId = await coachVolunteerNeedsPromise;
  }
  })();

  // Parent/joueur: un seul calendrier lecture-seule + RSVP, tous enfants confondus.
  let familyEvents: AdminUpcomingEvent[] = [];
  let familyOrganisationTasks: Record<string, EventTasksState> = {};
  let familyVolunteerNeedsByEventId: Record<string, VolunteerNeed[]> = {};
  let familyRsvpPlayers: {
    id: string;
    name: string;
    teamIds: string[];
    avatarUrl: string | null;
    // Retour de Cindy du 29/08 : sépare "Mon équipe" (ce booléen) de "Mes
    // enfants" — les deux onglets se filtrent chacun sur ce champ plutôt
    // que de fusionner les deux identités sous un même sélecteur de
    // pastilles ambigu ("Ma famille" mélangeait sa propre fiche et ses
    // enfants).
    isSelf: boolean;
  }[] = [];
  const familyRsvpStatusByKey: Record<string, string> = {};
  const familyBirthdayMembers: BirthdaySource[] = [];
  const familyTeamCards: FamilyTeamCardData[] = [];
  let familyCotisations: AdminCotisation[] = [];
  // "Mes pénalités" (retour de Cindy du 2026-08-22) : toutes celles de tous
  // les enfants de la famille, comme familyCotisations juste au-dessus.
  let familyPenalites: AdminPenalite[] = [];

  const familyPromise = (async () => {
  if (players.length > 0) {
    const playerTeamIdsList = await Promise.all(
      players.map((p) => getPlayerTeamIds(supabase, p.id))
    );
    familyRsvpPlayers = players.map((p, i) => ({
      id: p.id,
      // Prénom réel plutôt que "Toi" (retour de Cindy du 2026-08-24,
      // "renommer l'onglet 'toi' qui le concerne par mon prénom") : la
      // pastille "Enfant" se lit d'un coup d'œil comme les autres,
      // Raphaël/Léonie, plutôt que de faire l'exception.
      name: p.name,
      teamIds: playerTeamIdsList[i],
      avatarUrl: p.avatarUrl,
      isSelf: p.isSelf,
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
    // Hissé hors du bloc teamsQueryResults comme rosterByTeamId ci-dessus :
    // familyEvents (plus bas, hors de ce bloc) en a besoin pour nommer un
    // événement club réservé à quelques équipes (target_team_ids) — sinon
    // limité aux seules équipes des enfants, mais c'est déjà tout ce que
    // cette page charge pour cette famille (voir resolveEventTeamName).
    const teamsById = new Map<
      string,
      {
        id: string;
        name: string | null;
        category: string | null;
        ffbb_url: string | null;
        sort_order: number | null;
        pending_coach_names: string | null;
      }
    >();

    // Ces trois groupes de requêtes ne dépendent que de allTeamIds /
    // familyPlayerIds, déjà connus ci-dessus — jamais les uns des autres —
    // donc partis ensemble plutôt qu'à la queue leu leu.
    const [teamsQueryResults, eventsRes, familyCotisationRes, familyPenaliteRes] = await Promise.all([
      allTeamIds.length > 0
        ? runBatched(
            [
              () =>
                supabase
                  .from("teams")
                  .select("id, name, category, ffbb_url, sort_order, pending_coach_names")
                  .in("id", allTeamIds),
              // Retour d'audit du 28/08 : un embed direct sur players()
              // ouvrait, via la policy RLS "parent select teammates of own
              // child teams", toute la fiche du coéquipier (notes
              // médicales, adresse, téléphones des parents) à qui
              // interrogeait l'API directement — la RLS filtre des lignes,
              // jamais des colonnes. Ce embed passe maintenant par
              // family_teammate_roster, une vue qui n'expose que les
              // colonnes déjà utilisées ici (id/prénom/nom/naissance/
              // catégorie), même principe que teammate_names ailleurs
              // dans ce fichier. La policy RLS d'origine a été supprimée
              // (voir 20261029000000_family_teammate_roster_view.sql).
              async () => {
                const linksRes = await supabase
                  .from("team_players")
                  .select("team_id, player_id")
                  .in("team_id", allTeamIds);
                const uniquePlayerIds = Array.from(
                  new Set((linksRes.data ?? []).map((r) => r.player_id))
                );
                const rosterRes =
                  uniquePlayerIds.length > 0
                    ? await supabase
                        .from("family_teammate_roster")
                        .select("id, first_name, last_name, birth_date, category")
                        .in("id", uniquePlayerIds)
                    : { data: [] as {
                        id: string;
                        first_name: string | null;
                        last_name: string | null;
                        birth_date: string | null;
                        category: string | null;
                      }[] };
                const rosterById = new Map(
                  (rosterRes.data ?? []).map((p) => [p.id, p])
                );
                return {
                  data: (linksRes.data ?? [])
                    .map((r) => ({
                      team_id: r.team_id,
                      players: rosterById.get(r.player_id) ?? null,
                    }))
                    // Une fiche que family_teammate_roster ne renvoie pas
                    // (cas normalement impossible ici, tous ces joueurs
                    // sont bien coéquipiers d'un enfant du foyer) ne doit
                    // pas produire une ligne fantôme sans nom.
                    .filter((r) => r.players !== null),
                };
              },
              () =>
                supabase
                  .from("team_coaches")
                  .select("team_id, profiles(id, first_name, last_name, phone)")
                  .in("team_id", allTeamIds),
              () =>
                supabase
                  .from("team_pending_coaches")
                  .select("team_id, players(id, first_name, last_name)")
                  .in("team_id", allTeamIds),
            ],
            // Voir lib/batch.ts / le bloc Bureau plus haut pour le contexte.
            4
          )
        : null,
      supabase
        .from("events")
        .select(
          "id, title, event_type, is_home, location, salle, start_time, end_time, notes, attendance_requested_at, team_score, opponent_score, team_id, target_team_ids, teams(id, name, category), collectes(id, prix, payment_link, cotisations(players(id, first_name, last_name)))"
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
      // Même garde-fou que la requête cotisations juste au-dessus (Cindy
      // Bureau + parente) : filtre explicite plutôt que la seule RLS.
      familyPlayerIds.length > 0
        ? supabase
            .from("penalites")
            .select(
              "id, player_id, amount, notes, penalite_date, statut, paid_at, payment_link, players(first_name, last_name)"
            )
            .in("player_id", familyPlayerIds)
            .order("penalite_date", { ascending: false })
        : null,
    ]);

    familyPenalites = (
      (familyPenaliteRes?.data ?? []) as unknown as {
        id: string;
        player_id: string;
        amount: number;
        notes: string | null;
        penalite_date: string | null;
        statut: string | null;
        paid_at: string | null;
        payment_link: string | null;
        players: { first_name: string | null; last_name: string | null } | null;
      }[]
    ).map((p) => ({
      id: p.id,
      playerId: p.player_id,
      playerName:
        [p.players?.first_name, p.players?.last_name].filter(Boolean).join(" ") || "Joueur",
      amount: p.amount,
      notes: p.notes,
      penaliteDate: p.penalite_date,
      statut: p.statut,
      paidAt: p.paid_at,
      paymentLink: p.payment_link,
    }));

    if (teamsQueryResults) {
      const [teamsRes, teammateRowsRes, teamCoachesRes, teamPendingCoachesRes] =
        teamsQueryResults;

      (teamsRes.data ?? []).forEach((t) => teamsById.set(t.id, t));
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
            // Même correctif que familyRsvpPlayers plus haut : prénom réel
            // plutôt que "Toi", pour "Équipe de {prénom}".
            playerName: p.name,
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
      const paidInfo = resolvePaidInfo(e.collectes);
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
        isPaid: paidInfo.isPaid,
        collecteId: paidInfo.collecteId,
        paidAmount: paidInfo.paidAmount,
        paymentLink: paidInfo.paymentLink,
        paidParticipants: paidInfo.paidParticipants,
        teamId: team?.id ?? null,
        targetTeamIds: e.target_team_ids ?? null,
        teamName: resolveEventTeamName(team, e.target_team_ids ?? null, teamsById),
        rsvpCounts: { present: 0, absent: 0, late: 0, pending: 0 },
        benevoleIds: [],
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
    // Besoins d'organisation de TOUS les événements de la fratrie, pas
    // seulement ceux à venir — même raison que côté Bureau plus haut.
    // Ne dépend que de eventIds (déjà connu ci-dessus) : parti dans ce
    // même Promise.all au lieu d'un aller-retour séquentiel à part après
    // coup — même correctif que adminPromise/coachPromise plus haut.
    const [rsvpRowsRes, familyPaymentRes, extraFamilyTasks, familyVolunteerNeedsData] =
      await runBatched(
        [
          () =>
            eventIds.length > 0 && allRosterPlayerIds.length > 0
              ? supabase
                  .from("rsvps")
                  .select("event_id, player_id, status")
                  .in("event_id", eventIds)
                  .in("player_id", allRosterPlayerIds)
              : Promise.resolve(null),
          () =>
            familyCotisationIds.length > 0
              ? supabase
                  .from("cotisation_payments")
                  .select("id, cotisation_id, amount, mode, detail, expected_cash_date, paid_at")
                  .in("cotisation_id", familyCotisationIds)
                  .order("paid_at", { ascending: false })
              : Promise.resolve(null),
          () => getEventTasksByEventId(supabase, upcomingFamilyEventIds),
          () => getVolunteerNeedsByEventId(supabase, eventIds),
        ],
        // Voir lib/batch.ts / le bloc Bureau plus haut pour le contexte.
        4
      );
    familyVolunteerNeedsByEventId = familyVolunteerNeedsData;

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
    // peine de les calculer séparément. Un événement club-wide (teamId ET
    // targetTeamIds null, ex. stage d'été) n'a pas d'effectif d'équipe :
    // ni pastille ni liste, comme avant ce correctif. Un événement ciblant
    // des équipes précises (targetTeamIds, retour d'audit du 28/08) prend
    // l'union dédupliquée de leurs rosters, même principe que rosterSize
    // plus haut dans ce fichier.
    familyEvents.forEach((e) => {
      const roster = e.teamId
        ? rosterByTeamId.get(e.teamId) ?? []
        : e.targetTeamIds
          ? Array.from(
              new Map(
                e.targetTeamIds
                  .flatMap((id) => rosterByTeamId.get(id) ?? [])
                  .map((p) => [p.id, p] as const)
              ).values()
            )
          : [];
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
  })();

  // Les trois blocs Bureau/Coach/Famille ci-dessus tournent en parallèle
  // (voir commentaire au-dessus de adminPromise) : on attend ici le plus
  // lent des trois, juste avant le premier endroit qui lit leurs résultats.
  await Promise.all([adminPromise, coachPromise, familyPromise]);

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
    ? // coachMemberDetailsByPlayerId indexe la même fiche sous deux clés
      // pour une ligne Coach (id joueur ET id compte, voir plus haut) :
      // Object.values() la comptait donc deux fois sans ce dédoublonnage
      // par m.id, et affichait le même anniversaire deux fois dans le
      // widget. Un membre archivé (parti du club) ne doit plus non plus y
      // figurer — filtre absent jusqu'ici côté Coach, déjà présent côté
      // Bureau juste au-dessus.
      Array.from(new Map(Object.values(coachMemberDetailsByPlayerId).map((m) => [m.id, m])).values())
        .filter((m) => !m.archivedAt)
        .map((m) => ({
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        birthDate: m.birthDate,
        category: m.category,
      }))
    : [];

  const tabs: DashboardTab[] = [];

  // Retour de Cindy du 29/08, après discussion : plus aucun repli/fusion
  // entre identités — quatre onglets indépendants (Bureau / Équipe(s)
  // coachée(s) / Mon équipe / Mon enfant ou Mes enfants), chacun affiché
  // seulement s'il s'applique. "Mon équipe" et "Mes enfants" sont le MÊME
  // composant FamilyView, réutilisé deux fois avec un sous-ensemble
  // différent de familyRsvpPlayers (isSelf true/false) plutôt qu'un seul
  // onglet "Ma famille" mélangeant sa propre fiche et ses enfants sous un
  // même sélecteur de pastilles — c'est justement ce mélange qu'Émilie
  // ROBERT (Trésorière + joueuse Loisirs F + maman) trouvait confus.
  // Élimine au passage l'ancien cas particulier "coach sans enfant" (sa
  // fiche perso noyée dans l'onglet Équipe, voir showOwnPlayerSummary
  // dans coach-view.tsx) : "Mon équipe" s'affiche pareil pour tout le
  // monde qui a une fiche joueur, qu'il coache ou non par ailleurs.
  const myTeamRsvpPlayers = familyRsvpPlayers.filter((p) => p.isSelf);
  // Retour de Cindy du 29/08 (cas de Basile, qui coache les deux équipes de
  // ses filles) : un enfant dont TOUTES les équipes sont déjà coachées par
  // cette personne fait doublon avec l'onglet "Équipe(s) coachée(s)" (mêmes
  // matchs/entraînements) — on ne le liste pas dans "Mes enfants". Un enfant
  // dans une équipe qu'elle ne coache pas (ou sans équipe assignée) reste
  // affiché normalement.
  const myChildrenRsvpPlayers = familyRsvpPlayers.filter(
    (p) =>
      !p.isSelf &&
      !(p.teamIds.length > 0 && p.teamIds.every((id) => coachedTeamIds.has(id)))
  );

  function buildFamilyView(rsvpPlayers: typeof familyRsvpPlayers) {
    return (
      <FamilyView
        events={familyEvents}
        rsvpPlayers={rsvpPlayers}
        rsvpStatusByKey={familyRsvpStatusByKey}
        birthdayMembers={familyBirthdayMembers}
        teamCards={familyTeamCards}
        tasksByEventId={familyOrganisationTasks}
        carpoolByEventId={carpoolOffersByEventId}
        whatsappGroups={whatsappGroups}
        eventRoles={eventRoleTypes}
        volunteerNeedsByEventId={familyVolunteerNeedsByEventId}
        cotisations={familyCotisations}
        penalites={familyPenalites}
      />
    );
  }

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
          sponsors={adminSponsors}
          benevoles={adminBenevoles}
          penalites={adminPenalites}
          automationSettings={adminAutomationSettings}
          eventRoles={eventRoleTypes}
          volunteerNeedsByEventId={adminVolunteerNeedsByEventId}
        />
      ),
    });
  }

  if (isCoach) {
    tabs.push({
      key: "coach",
      // Retour de Cindy du 29/08 : "Équipe" tout court prêtait à confusion
      // une fois "Mon équipe" introduit à côté (celui-là, c'est là où on
      // JOUE soi-même) — "coachée(s)" lève l'ambiguïté d'un coup d'œil.
      label: coachTeamsWithRoster.length > 1 ? "Équipes coachées" : "Équipe coachée",
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
          volunteerNeedsByEventId={coachVolunteerNeedsByEventId}
          ownPlayerId={ownPlayerId}
          ownPlayerNextEvent={ownPlayerNextEvent}
          penalites={coachPenalites}
        />
      ),
    });
  }

  // "Mon équipe" : la propre fiche joueur de la personne (sa cotisation,
  // sa présence, ses pénalités, le WhatsApp de SON équipe) — dès qu'elle
  // en a une, qu'elle coache par ailleurs ou non. Toujours une identité
  // unique, jamais de sélecteur de pastilles à construire ici.
  if (myTeamRsvpPlayers.length > 0) {
    tabs.push({
      key: "own-team",
      label: "Mon équipe",
      content: buildFamilyView(myTeamRsvpPlayers),
    });
  }

  // "Mon enfant"/"Mes enfants" : uniquement les enfants, jamais mélangés
  // avec sa propre fiche — le sélecteur de pastilles de FamilyView ne sert
  // plus qu'à choisir entre eux quand il y en a plusieurs.
  if (myChildrenRsvpPlayers.length > 0) {
    tabs.push({
      key: "children",
      label: myChildrenRsvpPlayers.length > 1 ? "Mes enfants" : "Mon enfant",
      content: buildFamilyView(myChildrenRsvpPlayers),
    });
  }

  // Bandeau "Cette semaine" de l'en-tête (retour de Cindy/Sandrine Manzelle
  // du 2026-08-24) : jamais pour le Bureau — seulement côté Coach et/ou
  // Parent. Fusion coachEvents + familyEvents (dédoublonnée par id) pour
  // que quelqu'un qui cumule les deux casquettes (ex. Sandrine Manzelle)
  // voie tout d'un coup d'œil sans avoir à choisir un onglet d'abord.
  const headerWeekEvents: WeekStripEvent[] = isAdmin
    ? []
    : Array.from(
        new Map(
          [...coachEvents, ...familyEvents].map((e) => [
            e.id,
            {
              id: e.id,
              title: e.title,
              eventType: e.event_type,
              startTime: e.start_time,
              location: e.location,
              salle: e.salle,
              isHome: e.isHome,
              teamName: e.teamName,
            },
          ])
        ).values()
      );
  const showHeaderWeekBanner = !isAdmin && (isCoach || players.length > 0);

  return (
    <MobileNavProvider>
    {/* overflow-x-hidden (retour de Cindy du 2026-08-25, "pas de scroll
        droite gauche sur grand ecran surtout !... le responsive doit etre
        nickel") : filet de sécurité au niveau de la page entière — un
        débordement horizontal ponctuel quelque part à l'intérieur ne doit
        jamais se répercuter jusqu'à une barre de défilement horizontale
        sur toute la page. Les zones qui ont vraiment besoin de défiler
        latéralement (tableaux larges...) gardent leur propre
        overflow-x-auto local, inchangé. */}
    <div className="flex flex-1 flex-col overflow-x-hidden">
      <RealtimeSync />
      {/* Retour de Cindy du 2026-08-22 : logo seul (plus de texte "UBAC" à
          côté — la photo de profil ci-dessous porte désormais l'identité
          de la page). Le débordement de l'avatar façon Facebook, essayé
          dans un premier temps, est abandonné : avec un logo agrandi et
          bien centré, les deux se chevauchaient géométriquement (même
          bord gauche) — l'avatar reste sous la bande bleue, à plat.
          Bandeau jugé encore trop épais ensuite : remis à sa hauteur
          d'origine (simple padding). Logo ensuite jugé "tout petit" à 32px
          — agrandi à 44px, padding vertical resserré à py-2 pour absorber
          la croissance sans faire gonfler le bandeau ni laisser le logo
          en déborder. Déconnexion déplacée en toute fin du menu (voir
          admin-sidebar.tsx, logoutAction). */}
      {/* Bandeau unifié (direction artistique du 2026-08-23, confirmée
          avec Cindy via question directe) : avatar + "Bonjour" + prénom
          à gauche, grand logo en filigrane semi-transparent à droite
          (derrière les icônes, jamais au-dessus : pointer-events-none),
          icônes fonctionnelles inchangées par-dessus.
          Pas d'overflow-hidden ici (retour de Cindy du 2026-08-25,
          "quand je clique sur les notifications, elles sont masquées") :
          combiné à position sticky sur ce même élément, overflow-hidden
          rognait le popover des notifications (position fixed/absolute,
          voir notification-bell.tsx) dès qu'il dépassait la hauteur de
          l'en-tête — un piège CSS classique de ce duo sticky+overflow.
          Le logo en filigrane ci-dessous, lui, ne déborde que de
          quelques pixels (-right-2) : invisible en pratique sans
          clipping. */}
      <header className="sticky top-0 z-10 relative bg-gradient-to-br from-navy via-navy to-navy-dark px-4 py-4 shadow-md sm:px-6 sm:py-5">
        {/* Léger reflet en haut, pour donner un peu de profondeur au
            dégradé plutôt qu'un aplat totalement plat. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.06] to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-2 top-1/2 h-28 w-28 -translate-y-1/2 bg-contain bg-right bg-no-repeat opacity-25 sm:h-36 sm:w-36"
          style={{ backgroundImage: "url(/logo.png)" }}
        />
        {/* Retour de Cindy du 2026-08-25 ("toujours pas bon tout doit etre
            aligné") : la grille 1fr/auto/1fr essayée avant ne tombait
            toujours pas au centre réel. Repris avec une méthode qui ne
            dépend plus du tout de la largeur de la photo ou des icônes —
            photo et icônes restent une simple ligne flex justify-between
            (déjà correcte, elles s'affichaient bien aux deux bords), et le
            bandeau devient une superposition (absolute, left-1/2
            -translate-x-1/2) centrée sur ce conteneur relatif lui-même :
            un centrage géométrique garanti, indépendant de tout calcul de
            grille/flex fragile. */}
        <div className="relative mx-auto flex w-full max-w-[1600px] flex-col gap-3 sm:min-h-[3.5rem]">
          {/* Retour de Cindy du 28/08 ("le menu hamburger doit se trouver
              en haut à droite de l'écran sur smartphone") : ce duo
              photo/icônes vivait auparavant à même le conteneur externe,
              lequel passait en flex-col sous le seuil sm — le menu se
              retrouvait alors sur sa PROPRE ligne, empilé sous la
              photo/le prénom, au milieu de l'en-tête plutôt qu'à son coin
              supérieur droit. Sorti dans sa propre ligne toujours en
              flex-row (quelle que soit la largeur d'écran) : le menu est
              au bord droit de l'écran dès le premier rendu. Le conteneur
              externe reste en flex-col — c'est lui qui empile cette ligne
              et le bandeau "Cette semaine" en dessous sur mobile. */}
          <div className="flex w-full flex-row items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <AvatarUpload userId={user.id} avatarUrl={profile?.avatar_url ?? null} name={displayFirstName} size="lg" />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow">
                  Bonjour
                </p>
                {/* Retour de Cindy du 26/08 ("je vois son adresse mail à la
                    place de son prénom") : profile.first_name (le COMPTE de
                    connexion) était vide pour Basile, alors que sa FICHE
                    joueur (players, vérifié par Cindy — "basile a bien son
                    prenom") l'avait bien. Deux tables distinctes : ownPlayerRow
                    (players où profile_id = user.id, déjà chargé plus haut
                    pour "Mon espace") sert désormais de repli avant le
                    générique "adhérent·e" — jamais l'e-mail, qui n'a plus sa
                    place ici. Voir displayFirstName, calculé plus haut. */}
                <h1 className="truncate text-xl font-bold text-white sm:text-2xl">
                  {displayFirstName ? formatFirstName(displayFirstName) : "adhérent·e"}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <OrgChartButton />
              <NotificationBell />
              <MobileMenuButton />
            </div>
          </div>
          {/* Bandeau "Cette semaine" (retour de Cindy/Sandrine Manzelle du
              2026-08-24) : jamais pour le Bureau, voir showHeaderWeekBanner
              plus haut. */}
          {showHeaderWeekBanner && (
            // Retour de Cindy du 2026-08-25 : "CETTE SEMAINE" se retrouvait
            // coupé en haut de l'en-tête — top-1/2 + -translate-y-1/2
            // centre par rapport au point milieu mathématique du
            // conteneur, qui peut déborder au-dessus si le bandeau est
            // plus haut que prévu. inset-y-0 + flex + items-center
            // centre à l'intérieur de la vraie hauteur du conteneur,
            // jamais au-delà.
            <div className="sm:absolute sm:inset-y-0 sm:left-1/2 sm:flex sm:max-w-[calc(100%-18rem)] sm:-translate-x-1/2 sm:items-center">
              <WeekStripBanner events={headerWeekEvents} />
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
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
    </MobileNavProvider>
  );
}
