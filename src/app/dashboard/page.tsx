import { redirect } from "next/navigation";
import { Mail } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { chunkedQuery, runBatched, Semaphore } from "@/lib/batch";
import { logQueryErrors } from "@/lib/query-errors";
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
  rolesForEventType,
  type EventTasksState,
  type SeasonTaskTally,
} from "./event-tasks";
import { getVolunteerNeedsByEventId, type VolunteerNeed } from "./event-volunteer-needs";
import { shouldOfferCarpool } from "./salles";

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
  // Retour de Cindy du 29/08 : unifie ce suivi (jusqu'ici Bureau seul) avec
  // le tableau codé en dur qui alimentait la page d'accueil publique — logo/
  // lien affichés dans tous les espaces (voir SponsorDisplay plus bas), le
  // contrat reste strictement réservé au Bureau (jamais exposé via
  // sponsor_display).
  logoUrl: string | null;
  websiteUrl: string | null;
  contractType: string | null;
  sortOrder: number;
};

// Vue publique (sponsor_display) : nom + logo + lien uniquement, jamais le
// contrat ni les coordonnées de contact — lisible par tous les espaces
// (Bureau/Coach/Famille) et par la page d'accueil publique non connectée.
// Jamais montré côté Enfant (retour de Cindy).
export type SponsorDisplay = {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl: string | null;
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
  // Repli de contact (audit du 31/08) : un joueur invité par email (parent)
  // sans registration_email ni compte lié reste joignable via ce champ,
  // utilisé par team-card.tsx (contactsFor) — sur le type de base pour que
  // l'onglet Équipes (Bureau ET Coach) en bénéficie, pas seulement Membres.
  pendingParentEmail: string | null;
};

export type AdminMember = MemberDetail & {
  email: string | null;
  phone: string | null;
  hasParent: boolean;
  // pendingParentEmail: hérité de MemberDetail depuis le 31/08 (voir plus
  // haut) — plus dupliqué ici.
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

// Comptes rendus (retour de Cindy du 2026-09-01) : mairies/Bureau/coachs,
// texte simple rédigé dans l'appli (voir club-reports-section.tsx) — RLS
// (migrations 20260901010000/20260901020000) filtre déjà tout seule ce que
// chaque rôle a le droit de VOIR, donc une seule requête suffit ici, jamais
// une par catégorie/par rôle. authorName résolu ici (pas dans le composant
// client) : les comptes rendus COACH sont visibles par tous les coachs
// (retour explicite de Cindy, "visible pour le bureau et les coach"), donc
// il faut pouvoir dire qui a écrit quoi.
export type ClubReport = {
  id: string;
  category: "MAIRIE" | "BUREAU" | "COACH" | "CD17_LIGUE";
  title: string;
  reportDate: string;
  body: string | null;
  createdBy: string | null;
  authorName: string | null;
  // CD17_LIGUE uniquement (20260901030000) : un vrai fichier déposé, jamais
  // du texte. fileUrl est une URL signée déjà prête à l'emploi, générée ici
  // (jamais côté client) — un lien <a href> classique au premier rendu,
  // pas une navigation déclenchée après un clic + un aller-retour réseau,
  // qui se ferait bloquer par le bloqueur de popup sur iPhone.
  filePath: string | null;
  fileUrl: string | null;
  updatedAt: string;
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
    team_players: { teams: { name: string | null; category: string | null } | null }[] | null;
  } | null;
  // Retour de Cindy du 2026-09-01 ("z.Sénior" affiché alors que Membres
  // montre "Loisirs F") : players.category est un texte figé, rempli une
  // fois à l'import et jamais mis à jour par tous les chemins qui changent
  // l'équipe d'un joueur ensuite (seule la fiche membre le fait). L'équipe
  // réellement affectée (team_players -> teams.category, la même donnée
  // que la colonne "Équipe(s)" de Membres depuis le 31/08) prime donc ici ;
  // players.category ne sert plus qu'en dernier recours, pour un joueur
  // qui n'a jamais été affecté à aucune équipe.
  const realCategory = player?.team_players?.[0]?.teams?.category ?? null;
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
    category: realCategory ?? player?.category ?? null,
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
  // sera là ?" de la carte d'événement. Retour de Cindy du 30/08 : visible
  // sur les 3 espaces (Bureau/Coach/Famille, voir buildPresentPlayers) —
  // avant cette date, seul le bloc Famille le renseignait.
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

// Même normalisation que unaccent(lower(trim(...))) côté SQL
// (handle_new_user, auto-liaison parent/coach) — reprise ici en JS pour la
// même raison : deux orthographes différentes du même nom (import FFBB
// sans accent vs saisie clavier avec) ne doivent pas être vues comme deux
// personnes différentes.
const DIACRITICS_PATTERN = new RegExp("[\\u0300-\\u036f]", "g");

function normalizeName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(DIACRITICS_PATTERN, "")
    .trim()
    .toLowerCase();
}

// Retour de Cindy du 30/08 : décision sur le badge Bureau hérité à tort par
// un majeur (18-19 ans) partageant l'e-mail d'un parent du Bureau — plutôt
// que d'exiger player.profile_id (bloqué : aucun membre du Bureau n'a sa
// fiche reliée à son compte, voir tentative annulée du 17/08), on compare
// le nom de LA FICHE au nom du COMPTE qui porte cet e-mail. Même
// raisonnement que l'auto-liaison parent/coach ailleurs dans ce fichier :
// le nom, pas l'email seul, distingue "c'est bien le titulaire" de "c'est
// juste un proche qui partage l'adresse". Si aucun compte n'existe encore
// pour cet e-mail (Bureau pas encore inscrit) ou que la fiche n'a pas de
// nom, on ne peut pas trancher — le comportement d'avant (email + majeur)
// reste le repli, pour ne pas retirer le badge à tort à quelqu'un dont on
// ne peut pas vérifier le nom.
function bureauFicheMatchesAccountName(
  player: { first_name: string | null; last_name: string | null },
  account: { first_name: string | null; last_name: string | null } | undefined
): boolean {
  if (!account) return true;
  const playerFirst = normalizeName(player.first_name);
  const playerLast = normalizeName(player.last_name);
  const accountFirst = normalizeName(account.first_name);
  const accountLast = normalizeName(account.last_name);
  if (!playerFirst || !playerLast || !accountFirst || !accountLast) return true;
  return playerFirst === accountFirst && playerLast === accountLast;
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

// Retour de Cindy du 31/08 (chantier "un seul calcul de présences pour
// toute l'appli") : Bureau/Coach/Famille avaient chacun leur propre calcul
// de compteurs/présents — un vrai risque de divergence, déjà responsable
// d'un bug le 30/08 (Famille marchait, Bureau non, et inversement pour une
// fonctionnalité). Famille faisait mieux que Bureau/Coach sur un point
// précis : elle ne comptait que les réponses des joueurs réellement dans
// l'effectif de CET événement, jamais une réponse orpheline (joueur retiré
// de l'équipe depuis, etc.). Bureau/Coach comptaient toute réponse reçue
// pour l'événement, sans revérifier l'effectif. Le calcul unique ci-dessous
// reprend la méthode de Famille (la plus prudente) : sur les données
// actuelles (aucune réponse orpheline connue), le résultat affiché ne
// change nulle part ; si une incohérence apparaissait un jour, elle serait
// désormais ignorée partout, jamais comptée à tort quelque part.
//
// Statuts bruts, jamais pré-agrégés : chaque appelant (Bureau/Coach via
// fetchRsvpsByEvent, Famille via sa propre requête plus prudente,
// inchangée) construit cette même Map à partir de ses propres lignes, puis
// appelle buildRsvpCounts/buildPresentPlayers avec l'effectif de
// l'événement concerné — c'est cet effectif, pas la requête, qui fait la
// différence de prudence entre espaces.
function buildRsvpStatusByEvent(
  rows: { event_id: string; player_id: string; status: string | null }[]
): Map<string, Map<string, string | null>> {
  const map = new Map<string, Map<string, string | null>>();
  rows.forEach((r) => {
    const byPlayer = map.get(r.event_id) ?? new Map<string, string | null>();
    byPlayer.set(r.player_id, r.status);
    map.set(r.event_id, byPlayer);
  });
  return map;
}

function buildRsvpCounts(
  statusByEvent: Map<string, Map<string, string | null>>,
  eventId: string,
  roster: { id: string }[]
) {
  const statuses = statusByEvent.get(eventId);
  let present = 0;
  let absent = 0;
  let late = 0;
  let answered = 0;
  roster.forEach((p) => {
    const status = statuses?.get(p.id);
    if (!status) return;
    answered += 1;
    if (status === "PRESENT") present += 1;
    else if (status === "ABSENT") absent += 1;
    else if (status === "LATE") late += 1;
  });
  return {
    present,
    absent,
    late,
    pending: Math.max(0, roster.length - answered),
  };
}

function buildPresentPlayers(
  statusByEvent: Map<string, Map<string, string | null>>,
  eventId: string,
  roster: { id: string; first_name: string | null; last_name: string | null }[]
) {
  const statuses = statusByEvent.get(eventId);
  if (!statuses) return [];
  return roster
    .filter((p) => statuses.get(p.id) === "PRESENT")
    .map((p) => ({ id: p.id, firstName: p.first_name, lastName: p.last_name }));
}

async function fetchRsvpsByEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventIds: string[],
  dbLimit: Semaphore
) {
  if (eventIds.length === 0) return new Map<string, Map<string, string | null>>();

  // Un .in("event_id", eventIds) direct posait problème dès que eventIds
  // couvrait tout l'historique du club (872 événements le 30/08) : URL
  // trop longue, requête rejetée par Supabase. Le contournement posé alors
  // (fetch de TOUTE la table, filtré en mémoire) fonctionnait, mais un
  // scan complet devient plus lent à mesure que la table grossit — retour
  // de Cindy du 02/09 : Postgres a fini par annuler ces requêtes lui-même
  // ("statement timeout"), avec une vraie page d'erreur ("Internal Server
  // Error") à la clé, puis un deuxième incident le même jour ("mes membres
  // ont disparu") causé par les tranches elles-mêmes, parties toutes en
  // même temps via Promise.all — puis un TROISIÈME incident (retour du
  // 03/09, vrai chargement Coach cette fois) causé par des plafonds locaux
  // (un par bloc) qui s'additionnaient au lieu de partager une seule
  // limite. dbLimit (voir sa création dans DashboardPage) est maintenant
  // LE plafond unique de toute la page, partagé jusqu'ici.
  // Retour de Cindy du 04/09 : ~94 requêtes Supabase distinctes par
  // chargement de tableau de bord (confirmé via l'onglet Observability de
  // Vercel, "External APIs") -- chacune rapide isolément (index/RLS/ANALYZE
  // déjà corrigés), mais leur simple NOMBRE, additionné, explique le temps
  // de chargement encore élevé. 150 (plutôt que 75) : divise par ~2 le
  // nombre de tranches nécessaires pour le même nombre d'événements, sans
  // rien restructurer -- valeur déjà utilisée par le passé sur ce projet,
  // jamais en cause pour une taille d'URL excessive.
  const { data: rsvpRows, errors } = await chunkedQuery(
    eventIds,
    150,
    (chunk) => supabase.from("rsvps").select("event_id, player_id, status").in("event_id", chunk),
    dbLimit
  );
  errors.forEach((error) => console.error("[fetchRsvpsByEvent] select rsvps failed (tranche):", error));
  return buildRsvpStatusByEvent(rsvpRows);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  // Retour de Cindy du 03/09 (troisième incident en moins de 24h, cette
  // fois sur un vrai chargement Coach) : UN seul plafond de requêtes
  // simultanées, partagé par TOUTE cette page — Bureau, Coach, Famille,
  // zone prioritaire, comptes rendus, requêtes en tranches — au lieu d'un
  // plafond par bloc qui s'additionnait aux autres (voir Semaphore,
  // lib/batch.ts, pour le détail).
  //
  // Historique du 03/09 (même soirée, deux ajustements successifs) :
  // 1) Remonté de 10 à 13 après avoir posé les index event_id
  //    (20261031090000) et team_players.player_id/team_coaches.coach_id
  //    (20261031110000) : les requêtes seules étaient redevenues rapides,
  //    donc un plafond plus proche des 15 connexions réelles de Supabase
  //    semblait pouvoir redonner du parallélisme sans risque.
  // 2) Redescendu à 6 juste après : preuve par pg_stat_activity, prise
  //    PENDANT un vrai ralentissement, que ce n'est pas le nombre de
  //    connexions qui limite (22 vues, largement sous le plafond) mais la
  //    puissance de calcul réelle de l'offre Nano — 6 à 9 requêtes
  //    event_tasks/event_volunteer_needs tournaient EN MÊME TEMPS, toutes
  //    aussi lentes les unes que les autres (jusqu'à 15s chacune, plutôt
  //    que quelques-unes rapides et le reste en attente). Autoriser plus
  //    de requêtes de front ne les fait pas aller plus vite quand c'est le
  //    calcul qui manque : ça les fait toutes ramer ensemble. Moins de
  //    requêtes en vol à la fois, mais chacune qui a vraiment la place de
  //    finir vite, plutôt que beaucoup qui se traînent ensemble.
  // 3) Remonté à 9 le 04/09, après le passage des tranches de 75 à 150
  //    (event-tasks.ts, event-volunteer-needs.ts, fetchRsvpsByEvent) :
  //    deux fois moins de tranches à faire tenir sous le même plafond, donc
  //    la contention de calcul qui avait justifié la baisse à 6 est moins
  //    probable pour le même volume de travail réel. Confirmé par un test
  //    réseau réel juste après déploiement : "Content Download" 21s -> 12,3s.
  // 4) Testé à 11 juste après, même soirée : régression nette, "Content
  //    Download" repassé à plus d'1 minute (contre 12,3s à 9) — la marge
  //    espérée n'existait pas, la limite réelle est entre 9 et 11.
  //    Redescendu à 9 aussitôt, confirmé comme le meilleur réglage mesuré
  //    ce soir (tranches à 150 comprises). Ne pas remonter au-delà sans
  //    revalider par le même test réseau avant/après.
  const dbLimit = new Semaphore(9);
  // Retour de Cindy du 03/09 (dernier round de la soirée, "content download"
  // à 30s malgré des requêtes individuelles redevenues rapides) : les 3
  // requêtes "events" de cette page (Bureau/Coach/Famille) n'avaient AUCUN
  // filtre de date -- elles chargeaient les 872 événements de tout
  // l'historique du club depuis sa création, à chaque connexion, pour tout
  // le monde. Cette liste sert ensuite de base à fetchRsvpsByEvent/
  // getVolunteerNeedsByEventId/getEventTasksByEventId/getCarpoolOffersByEventId
  // (voir upcomingEventIds/coachEventIds/familyEvents plus bas) -- gonflant
  // à la fois le nombre de requêtes en tranches ET la taille de la page à
  // construire et transférer (React doit sérialiser des centaines
  // d'événements/présences jamais affichés). 6 mois en arrière + tout
  // l'avenir couvre largement une saison en cours ; l'historique plus
  // ancien n'est plus chargé par défaut ici (à réintroduire plus tard via
  // un onglet "historique" séparé si besoin, pas au chargement du tableau
  // de bord).
  // Composant serveur (pas un hook), exécuté une fois par requête réelle :
  // lire l'heure courante ici est le comportement voulu, pas un effet de
  // bord à masquer.
  const eventsWindowStart = new Date(
    // eslint-disable-next-line react-hooks/purity -- voir commentaire au-dessus
    Date.now() - 183 * 24 * 60 * 60 * 1000
  ).toISOString();
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

  logQueryErrors("détection de rôle", {
    profileResult,
    adminResult,
    coachResult,
    playerLinksResult,
    ownPlayerRowResult,
  });

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
    : { data: [] as { teams: unknown }[], error: null };
  logQueryErrors("détection de rôle (coach en attente)", { pendingCoachResult });

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

  // Comptes rendus (retour de Cindy du 2026-09-01) : jamais pour un simple
  // parent/joueur, seulement Bureau et/ou Coach. RLS filtre déjà tout
  // (Bureau voit tout ; un coach voit Mairies/Bureau/CD17-Ligue et TOUS les
  // comptes rendus COACH, retour explicite de Cindy — la modification/
  // suppression, elle, reste réservée à l'auteur ou au Bureau, voir
  // canEditRow dans club-reports-section.tsx).
  //
  // Retour de Cindy du 2026-09-02 ("connexions très longues") : ces 3
  // allers-retours (la liste, puis les auteurs, puis les liens de fichiers)
  // étaient attendus ici, bloquant tout le reste de la page derrière eux à
  // chaque connexion Bureau/Coach — même bug déjà corrigé le 22/08 pour
  // adminPromise/coachPromise/familyPromise (voir leur commentaire plus
  // bas) : démarré ici en arrière-plan, réellement attendu beaucoup plus
  // loin, aux côtés de ces trois mêmes promesses. Les deux étapes internes
  // (liens de fichiers, noms d'auteurs) ne dépendent l'une de l'autre en
  // rien non plus — lancées ensemble plutôt qu'à la queue leu leu.
  let clubReports: ClubReport[] = [];
  const clubReportsPromise = (async () => {
    if (!isAdmin && !isCoach) return;
    const { data: clubReportsData, error: clubReportsError } = await supabase
      .from("club_reports")
      .select("id, category, title, report_date, body, created_by, file_path, updated_at")
      .order("report_date", { ascending: false });
    if (clubReportsError) {
      console.error("[dashboard] lecture club_reports échouée:", clubReportsError);
    }
    const filePaths = (clubReportsData ?? [])
      .map((r) => r.file_path)
      .filter((p): p is string => Boolean(p));
    const authorIds = Array.from(
      new Set((clubReportsData ?? []).map((r) => r.created_by).filter((id): id is string => Boolean(id)))
    );
    const [signedUrlsResult, authorProfilesResult] = await Promise.all([
      filePaths.length > 0
        ? supabase.storage.from("club-report-files").createSignedUrls(filePaths, 3600)
        : Promise.resolve({ data: [] as { path: string | null; signedUrl: string }[], error: null }),
      authorIds.length > 0
        ? supabase.from("profiles").select("id, first_name, last_name").in("id", authorIds)
        : Promise.resolve({ data: [] as { id: string; first_name: string | null; last_name: string | null }[], error: null }),
    ]);
    if (signedUrlsResult.error) {
      console.error("[dashboard] génération des liens club-report-files échouée:", signedUrlsResult.error);
    }
    if (authorProfilesResult.error) {
      console.error("[dashboard] résolution des auteurs de club_reports échouée:", authorProfilesResult.error);
    }
    // .path (pas l'index) : createSignedUrls ne garantit pas de renvoyer
    // ses résultats dans le même ordre que les chemins demandés.
    const fileUrlByPath = new Map<string, string>();
    (signedUrlsResult.data ?? []).forEach((s) => {
      if (s.signedUrl && s.path) fileUrlByPath.set(s.path, s.signedUrl);
    });
    const authorNameById = new Map<string, string>();
    (authorProfilesResult.data ?? []).forEach((p) => {
      authorNameById.set(p.id, formatPersonName(p.first_name, p.last_name, "Membre"));
    });
    // Même faux positif que adminAutomationSettings plus bas (voir son
    // commentaire) : composant serveur, exécuté une seule fois, jamais relu
    // avant le "await Promise.all(...)" qui suit tous ces blocs.
    // eslint-disable-next-line react-hooks/immutability
    clubReports = (clubReportsData ?? []).map((r) => ({
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
  })();

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

  // Retour de Cindy du 04/09 ("il a trois espaces, pourquoi ça bug") : un
  // compte qui cumule Bureau + Coach + Famille faisait construire et
  // envoyer les TROIS espaces en entier à chaque connexion, alors qu'un
  // seul est regardé à la fois (DashboardTabs, plus bas, se contentait de
  // les cacher/afficher côté client, tous déjà là). Repéré via un compte
  // à un seul espace toujours rapide contre le même compte à trois espaces
  // systématiquement lent, indépendamment de tous les autres correctifs de
  // la soirée (index, sécurité, tranches...).
  //
  // Ici, en amont de adminPromise/coachPromise/familyPromise : décider
  // lequel des espaces éligibles est "actif" pour CETTE requête, à partir
  // du paramètre d'URL ?tab=... posé par DashboardTabs au clic (voir ce
  // fichier). Seul l'espace actif sera réellement calculé plus bas ; les
  // autres gardent juste leur bouton (visible, cliquable) mais un contenu
  // vide tant qu'on n'a pas cliqué dessus. Un compte à un seul espace
  // éligible n'est JAMAIS concerné (activeTab tombe toujours sur cet
  // unique espace) : zéro changement de comportement pour lui.
  //
  // Éligibilité calculée avec des données déjà connues à ce stade (isAdmin,
  // isCoach, ownPlayerId, players) — sans attendre aucune des trois grosses
  // promesses -- volontairement approximative pour "children" (le vrai
  // filtre "doublon avec une équipe déjà coachée" ne s'applique qu'une fois
  // cet onglet réellement actif et familyPromise exécutée en entier ; ici,
  // ça ne sert qu'à décider si le bouton doit apparaître ou non).
  const hasOwnTeamTab = ownPlayerId !== null;
  const hasChildrenTab = players.some((p) => !p.isSelf);
  const eligibleTabKeys = [
    isAdmin && "admin",
    isCoach && "coach",
    hasOwnTeamTab && "own-team",
    hasChildrenTab && "children",
  ].filter((k): k is string => Boolean(k));
  const resolvedSearchParams = await searchParams;
  const requestedTab =
    typeof resolvedSearchParams.tab === "string" ? resolvedSearchParams.tab : null;
  const activeTab =
    requestedTab && eligibleTabKeys.includes(requestedTab)
      ? requestedTab
      : (eligibleTabKeys[0] ?? null);
  // Un seul espace éligible : jamais de distinction actif/inactif à faire,
  // tout se calcule comme avant. Ces trois booléens décident, une fois pour
  // toutes, quel(s) bloc(s) font vraiment leur travail lourd pour CETTE
  // requête -- réutilisés à la fois pour les gardes de adminPromise/
  // coachPromise/familyPromise ET pour la réutilisation Bureau -> Coach
  // (bureauDataLoaded : coachPromise ne peut piocher dans adminTeamsRaw
  // etc. QUE si le bloc Bureau a réellement tourné, pas juste si isAdmin
  // est vrai -- sinon un compte Bureau+Coach qui regarde l'onglet Coach
  // lirait des tableaux vides puisque adminPromise n'aurait rien rempli).
  const onlyOneEspace = eligibleTabKeys.length <= 1;
  const bureauDataLoaded = isAdmin && (onlyOneEspace || activeTab === "admin");
  const coachDataActive = isCoach && (onlyOneEspace || activeTab === "coach");
  const familyDataActive =
    players.length > 0 &&
    (onlyOneEspace || activeTab === "own-team" || activeTab === "children");

  const coachedTeamIds = new Set(coachedTeams.map((t) => t.id));

  // Ces quatre requêtes ne dépendent que de valeurs déjà connues à ce stade
  // (players, coachedTeams, isAdmin/coachedTeamIds) — jamais les unes des
  // autres — donc parties en même temps plutôt qu'à la queue leu leu.
  // C'est cette chaîne de petites requêtes séquentielles, répétée à chaque
  // clic (voir router.refresh() dans toute l'appli), qui rendait chaque
  // action perceptiblement lente.
  //
  // Toute cette "zone prioritaire" (retour de Cindy du 02/09, connexions
  // Famille/Enfant très lentes) tournait ensuite en bloquant : un
  // `await` de plus au tout premier niveau de la fonction, AVANT même que
  // adminPromise/coachPromise/familyPromise ne soient définies plus bas —
  // donc avant qu'elles ne commencent à s'exécuter, alors qu'elles n'ont
  // besoin de rien de ce qui suit ici. Comme les quatre autres promesses
  // différées de cette page, elle démarre maintenant en même temps
  // qu'elles (voir priorityZonePromise, rejointe au même
  // "await Promise.all(...)" plus bas) au lieu de les faire toutes
  // attendre son tour.
  const priorityZonePromise = (async () => {
  const [
    whatsappGroupsRes,
    convocationCardsRaw,
    coachCards,
    eventRoleTypes,
    sponsorDisplayRes,
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
    // Retour de Cindy du 29/08 : logo+nom+lien affichés dans tous les
    // espaces (jamais le contrat ni les coordonnées de contact, réservés à
    // la table sponsors elle-même, Bureau uniquement) — vue dédiée
    // (sponsor_display) plutôt qu'une policy RLS plus étroite sur la table
    // complète, même principe que family_teammate_roster.
    supabase
      .from("sponsor_display")
      .select("id, name, logo_url, website_url")
      .order("sort_order", { ascending: true }),
  ]);

  logQueryErrors("commun (whatsapp/sponsors)", { whatsappGroupsRes, sponsorDisplayRes });

  const sponsorDisplay: SponsorDisplay[] = (sponsorDisplayRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    logoUrl: s.logo_url,
    websiteUrl: s.website_url,
  }));

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
    getEventTasksByEventId(supabase, priorityEventIds, dbLimit),
    getCarpoolOffersByEventId(supabase, priorityEventIds, dbLimit),
  ]);

  return {
    convocationCards,
    coachCards,
    ownPlayerNextEvent,
    whatsappGroups,
    eventRoleTypes,
    sponsorDisplay,
    eventTasksByEventId,
    carpoolOffersByEventId,
  };
  })();

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
  // Retour d'audit du 30/08 : côté Coach, un enfant sans e-mail
  // d'inscription ni secondaire affiche quand même l'e-mail de son
  // parent relié en dépannage (coachContactEmailByPlayerId) — jamais
  // reporté ici, alors que team-card.tsx (utilisé par les deux espaces)
  // sait déjà s'en servir. Même construction que le téléphone juste
  // au-dessus.
  const adminContactEmailByPlayerId: Record<string, string> = {};
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
  // Retour de Cindy du 04/09 : un compte qui cumule Bureau + Coach (ou +
  // Famille) déclenchait deux fois la même lecture de teams/team_players/
  // team_coaches/team_pending_coaches -- le Bureau charge déjà TOUT
  // (aucun filtre), donc c'est forcément un sur-ensemble de ce dont
  // coachPromise/familyPromise ont besoin. Exposées ici (brutes, avant
  // toute mise en forme) pour que ces deux blocs puissent, seulement
  // quand isAdmin est vrai, filtrer ces données déjà en mémoire au lieu
  // de les redemander à la base -- aucun changement pour un compte à un
  // seul espace (ces variables restent vides, jamais lues).
  let adminTeamsRaw: {
    id: string;
    name: string | null;
    category: string | null;
    ffbb_url: string | null;
    sort_order: number | null;
    pending_coach_names: string | null;
  }[] = [];
  let adminTeamPlayersRaw: { team_id: string; player_id: string; position: string | null }[] = [];
  let adminTeamCoachesRaw: { team_id: string; coach_id: string }[] = [];
  let adminTeamPendingCoachesRaw: { team_id: string; player_id: string }[] = [];

  const adminPromise = (async () => {
  if (bureauDataLoaded) {
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
            .select("team_id, player_id, position"),
        () => supabase.from("team_coaches").select("team_id, coach_id"),
        () =>
          supabase
            .from("cotisations")
            .select(
              "id, saison, prix, remise, paiement, statut, mode_paiement, player_id, collecte_id, players(first_name, last_name, category, membership_type, fbi_status, team_players(teams(name, category))), collectes(id, name, type)"
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
            .gte("start_time", eventsWindowStart)
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
        // Table complète (contrat + coordonnées de contact) réservée au
        // Bureau (voir policy "admin manage sponsors") — jamais exposée à
        // Coach/Famille. L'affichage logo+nom dans ces espaces lit une vue
        // séparée, sponsor_display (voir sponsorDisplayRes plus bas), qui
        // ne porte aucune de ces deux colonnes.
        () =>
          supabase
            .from("sponsors")
            .select(
              "id, name, contact_name, contact_email, contact_phone, renewal_date, notes, logo_url, website_url, contract_type, sort_order"
            )
            // Retour de Cindy du 29/08 : trié par ordre d'affichage choisi
            // (flèches monter/descendre, sponsors-manager.tsx) plutôt que
            // par date de renouvellement — cette liste doit refléter
            // exactement l'ordre montré partout ailleurs pour que les
            // flèches aient un sens.
            .order("sort_order", { ascending: true }),
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
      // dbLimit (voir sa définition plus haut) : UN seul plafond partagé
      // avec tous les autres blocs de cette page (Coach, Famille, les
      // requêtes en tranches...) — retour de Cindy du 03/09, incident
      // causé par des plafonds séparés qui s'additionnaient au lieu de
      // partager une seule limite.
      dbLimit
    );

    // Exposées pour coachPromise/familyPromise (voir leur commentaire) --
    // avant tout filtrage/mise en forme, telles que reçues de la base.
    adminTeamsRaw = teamsRes.data ?? [];
    adminTeamPlayersRaw = teamPlayersRes.data ?? [];
    adminTeamCoachesRaw = teamCoachesRes.data ?? [];
    adminTeamPendingCoachesRaw = teamPendingCoachesRes.data ?? [];

    logQueryErrors("Bureau", {
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
    });

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
    // Retour de Cindy du 30/08 : sert à distinguer "cette fiche EST le
    // membre du Bureau" de "cette fiche partage juste son email" (voir
    // bureauFicheMatchesAccountName) — le nom du compte qui porte cet
    // e-mail, pas celui de la fiche players qui pourrait être un proche.
    const profileNameByEmailLower = new Map(
      (profilesRes.data ?? [])
        .filter((p) => (p as { email: string | null }).email)
        .map((p) => [
          (p as { email: string }).email.trim().toLowerCase(),
          {
            first_name: (p as { first_name: string | null }).first_name,
            last_name: (p as { last_name: string | null }).last_name,
          },
        ])
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
    const emailByProfileId = new Map(
      (profilesRes.data ?? []).map((p) => [
        p.id,
        (p as { email: string | null }).email,
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
        : Promise.resolve({
            data: [] as { player_id: string; status: string; event_id: string }[],
            error: null,
          });
    const rsvpsByEventPromise = fetchRsvpsByEvent(supabase, upcomingEventIds, dbLimit);
    const adminVolunteerNeedsPromise = getVolunteerNeedsByEventId(supabase, upcomingEventIds, dbLimit);
    const adminNextEventRsvpRes = await adminNextEventRsvpPromise;
    logQueryErrors("Bureau (prochain événement)", { adminNextEventRsvpRes });
    const adminNextEventRsvpRows = adminNextEventRsvpRes.data;
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
      const email = emailByProfileId.get(pp.parent_id);
      if (email) adminContactEmailByPlayerId[pp.player_id] = email;
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
        // L'âge réel (date de naissance) est un premier signal, mais ne
        // couvre pas un majeur (18-19 ans) partageant encore l'email
        // familial — retour de Cindy du 30/08 : bureauFicheMatchesAccountName
        // compare en plus le nom de CETTE fiche à celui du compte qui
        // porte l'email (via profileNameByEmailLower), pour ne montrer le
        // badge que sur la fiche qui EST réellement le membre du Bureau.
        // Repli sur le comportement d'avant si aucun compte n'existe
        // encore pour cet email, ou si un des deux noms manque (voir la
        // fonction : mieux vaut un badge affiché à tort sur un cas qu'on
        // ne peut pas trancher que d'en retirer un à quelqu'un de légitime).
        bureauRole:
          memberEmail &&
          !isMinor(player.birth_date) &&
          bureauFicheMatchesAccountName(
            player,
            profileNameByEmailLower.get(memberEmail.trim().toLowerCase())
          )
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
        // La plus récente parmi trois connexions possibles : compte
        // Supabase Auth classique de CETTE fiche (Parent/Coach/Bureau), code
        // PIN enfant (Espace Enfant), ou compte d'UN des parents reliés —
        // retour de Cindy du 30/08 : un enfant sans compte propre (le cas
        // le plus courant) restait gris en permanence même quand son parent
        // utilisait l'appli chaque semaine (repéré sur Eva MARTIN, dont le
        // père Greg se connecte mais n'a pas de compte joueur à lui).
        // Aucun des trois ne s'exclut pour une même fiche.
        lastLoginAt: [
          player.profile_id ? lastLoginByProfileId.get(player.profile_id) : null,
          player.last_child_login_at,
          ...parentIds.map((pid) => lastLoginByProfileId.get(pid)),
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
      logoUrl: s.logo_url,
      websiteUrl: s.website_url,
      contractType: s.contract_type,
      sortOrder: s.sort_order,
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
      const eventRoster: RosterPlayer[] = team
        ? (rosterByTeam.get(team.id) ?? [])
        : (e.target_team_ids as string[] | null)
          ? Array.from(
              new Map<string, RosterPlayer>(
                (e.target_team_ids as string[])
                  .flatMap((id: string) => rosterByTeam.get(id) ?? [])
                  .map((p: RosterPlayer) => [p.id, p] as const)
              ).values()
            )
          : [];
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
        rsvpCounts: buildRsvpCounts(rsvpsByEvent, e.id, eventRoster),
        // Retour de Cindy du 30/08 : "qui sera présent" visible partout, pas
        // seulement côté Famille (voir buildPresentPlayers) — même sujet que
        // le bug des présences plus tôt aujourd'hui, cette fois une
        // fonctionnalité jamais reportée sur Bureau/Coach plutôt qu'un bug.
        presentPlayers: buildPresentPlayers(rsvpsByEvent, e.id, eventRoster),
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
  // Joueurs ET coachs des équipes réellement COACHÉES uniquement (jamais
  // l'équipe où le coach joue lui-même) — même distinction que
  // coachPenaliteScope plus bas, réutilisée pour le widget anniversaires
  // (retour de Cindy du 30/08, même cause que le calendrier de "Équipe(s)
  // coachée(s))".
  let coachScopedMemberIds = new Set<string>();
  const coachContactPhoneByPlayerId: Record<string, string> = {};
  const coachContactEmailByPlayerId: Record<string, string> = {};
  const coachMemberDetailsByPlayerId: Record<string, MemberDetail> = {};
  const coachRsvpStatusByKey: Record<string, string> = {};
  // Motif d'absence saisi par la famille, affiché sur la carte du coach.
  const coachRsvpReasonByKey: Record<string, string | null> = {};

  const coachPromise = (async () => {
  if (coachDataActive) {
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

    // Retour de Cindy du 04/09 ("pourquoi ça bug quand on a plusieurs
    // espaces") : un compte Bureau + Coach (comme Basile après son ajout au
    // Bureau) redemandait team_players/team_coaches/team_pending_coaches/
    // teams à la base ICI, alors que le bloc Bureau (adminPromise) vient de
    // charger exactement ça, sans filtre -- un sur-ensemble garanti. On
    // teste bureauDataLoaded, pas isAdmin tout court : si l'espace Bureau
    // n'est pas l'onglet actif (voir plus haut, "un seul espace calculé à
    // la fois"), adminPromise n'a rien rempli du tout, et lire ses tableaux
    // reviendrait à lire du vide. Quand bureauDataLoaded, on attend
    // adminPromise (déjà bien avancé en parallèle, ou quasi instantané si
    // non-admin -- ce await ne coûte donc rien pour un compte Coach seul)
    // puis on filtre ces données déjà en mémoire au lieu d'un aller-retour
    // réseau. Forme du tableau ({data,error} par entrée) inchangée exprès :
    // tout le code plus bas (logQueryErrors, .data...) n'a rien à savoir de
    // la provenance.
    if (bureauDataLoaded) {
      await adminPromise;
    }

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
          bureauDataLoaded
            ? Promise.resolve({
                data: adminTeamPlayersRaw.filter((tp) => coachCalendarTeamIds.includes(tp.team_id)),
                error: null,
              })
            : supabase
                .from("team_players")
                .select("team_id, player_id, position")
                .in("team_id", coachCalendarTeamIds),
        () =>
          bureauDataLoaded
            ? Promise.resolve({
                data: adminTeamCoachesRaw.filter((tc) => coachCalendarTeamIds.includes(tc.team_id)),
                error: null,
              })
            : supabase
                .from("team_coaches")
                .select("team_id, coach_id")
                .in("team_id", coachCalendarTeamIds),
        () =>
          bureauDataLoaded
            ? Promise.resolve({
                data: adminTeamPendingCoachesRaw.filter((tpc) =>
                  coachCalendarTeamIds.includes(tpc.team_id)
                ),
                error: null,
              })
            : supabase
                .from("team_pending_coaches")
                .select("team_id, player_id")
                .in("team_id", coachCalendarTeamIds),
        // Retour de Cindy du 30/08 : Basile (coach U13F/U13M1 ET joueur
        // Séniors M) voyait le match de SON équipe jouée apparaître dans
        // le calendrier de "Équipe(s) coachée(s)" — coachCalendarTeamIds
        // mélange équipes coachées et équipe jouée, un choix qui datait du
        // calendrier fusionné d'avant le découpage en 4 onglets du 29/08
        // (voir coachPenaliteScope un peu plus bas : même cause, déjà
        // corrigée une fois pour les pénalités, jamais reportée ici).
        // "Mon équipe" (page.tsx, buildFamilyView) affiche déjà ce match
        // via son propre calcul indépendant (familyEvents) : le montrer
        // aussi ici serait un doublon hors de propos. Scope strictement
        // aux équipes réellement coachées ; coachCalendarTeamIds reste
        // utilisé juste au-dessus pour l'effectif (teamPlayersRes etc.),
        // nécessaire à l'onglet "Équipes" qui liste volontairement
        // l'équipe jouée comme un pill "Joueur" à part.
        () =>
          supabase
            .from("events")
            .select(
              "id, title, event_type, is_home, location, salle, start_time, end_time, notes, attendance_requested_at, team_score, opponent_score, team_id, target_team_ids, teams(id, name, category), collectes(id, prix, payment_link, cotisations(players(id, first_name, last_name)))"
            )
            .or(teamOrClubWideFilter(coachedTeamIds))
            .gte("start_time", eventsWindowStart)
            .order("start_time", { ascending: true }),
        () =>
          bureauDataLoaded
            ? Promise.resolve({
                data: adminTeamsRaw.filter((t) => ownOnlyTeamIds.includes(t.id)) as CoachedTeam[],
                error: null,
              })
            : ownOnlyTeamIds.length > 0
              ? supabase
                  .from("teams")
                  .select("id, name, category, ffbb_url, sort_order, pending_coach_names")
                  .in("id", ownOnlyTeamIds)
              : Promise.resolve({ data: [] as CoachedTeam[], error: null }),
        // Every club team, for the "Changer d'équipe" picker — teams is
        // readable by anyone (policy `using (true)`), et déjà chargé sans
        // filtre par le Bureau quand isAdmin (voir plus haut) : re-trié en
        // mémoire de la même façon (sort_order non nul) plutôt que
        // redemandé.
        () =>
          bureauDataLoaded
            ? Promise.resolve({
                data: adminTeamsRaw
                  .filter((t) => t.sort_order !== null)
                  .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999)),
                error: null,
              })
            : supabase
                .from("teams")
                .select("id, name, category, sort_order")
                .not("sort_order", "is", null)
                .order("sort_order"),
      ],
      // dbLimit partagé (voir lib/batch.ts / le bloc Bureau plus haut).
      dbLimit
    );

    logQueryErrors("Coach", {
      teamPlayersRes,
      teamCoachesRes,
      teamPendingCoachesRes,
      eventsRes,
      ownTeamsRes,
      allClubTeamsRes,
    });

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
      "id, profile_id, first_name, last_name, birth_date, category, sex, registration_email, registration_phone, address, postal_code, city, secondary_email, mother_phone, father_phone, other_phones, secondary_address, license_type, membership_type, fbi_status, medical_notes, other_notes, image_rights, player_charter_accepted, parent_charter_accepted, license_number, license_expires_at, medical_certificate_expires_at, archived_at, pending_parent_email";

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
    // Même filtre, étendu aux coachs/coachs en attente d'une équipe
    // coachée (pas seulement les joueurs) : sert au widget anniversaires
    // plus bas, qui doit lui aussi ignorer l'équipe jouée par le coach.
    coachScopedMemberIds = new Set([
      ...coachPenaliteScope,
      ...(teamCoachesRes.data ?? [])
        .filter((tc) => coachedTeamIds.includes(tc.team_id))
        .map((tc) => tc.coach_id),
      ...(teamPendingCoachesRes.data ?? [])
        .filter((tpc) => coachedTeamIds.includes(tpc.team_id))
        .map((tpc) => tpc.player_id),
    ]);
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
        : Promise.resolve({
            data: [] as { player_id: string; status: string; event_id: string }[],
            error: null,
          });
    // EVERY team each of these players belongs to, not just the coach's own
    // — that's what tells a player of the team apart from one lent by
    // another group, and it drives the roster's "Retirer" vs "Affecter"
    // action. Readable thanks to the "coach select all teams of own
    // players" policy.
    const allMembershipsPromise =
      playerIds.length > 0
        ? supabase.from("team_players").select("team_id, player_id").in("player_id", playerIds)
        : Promise.resolve({ data: [] as { team_id: string; player_id: string }[], error: null });
    const rsvpsByEventPromise = fetchRsvpsByEvent(supabase, coachEventIds, dbLimit);
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
            error: null,
          });
    const coachPenalitePromise =
      coachPenaliteScope.length > 0
        ? supabase
            .from("penalites")
            .select(
              "id, player_id, amount, notes, penalite_date, statut, paid_at, payment_link, players(first_name, last_name)"
            )
            .in("player_id", coachPenaliteScope)
        : Promise.resolve({ data: [] as unknown[], error: null });
    // Les rôles (maillots/goûter) de TOUS les événements à venir, pas
    // seulement du prochain match : l'onglet "Planning & Rôles" les liste
    // date par date.
    const coachOrganisationTasksExtraPromise = getEventTasksByEventId(
      supabase,
      upcomingCoachEventIds,
      dbLimit
    );
    // Besoins d'organisation de TOUS les événements de l'équipe, pas
    // seulement ceux à venir — même raison que côté Bureau juste plus haut.
    const coachVolunteerNeedsPromise = getVolunteerNeedsByEventId(supabase, coachEventIds, dbLimit);

    const [playersRes, coachProfilesRes, parentPlayerRes, coachFichesRes] =
      await runBatched(
        [
          () =>
            playerIds.length > 0
              ? supabase.from("players").select(playerColumns).in("id", playerIds)
              : Promise.resolve({ data: [] as Person[], error: null }),
          () =>
            coachIds.length > 0
              ? supabase
                  .from("profiles")
                  .select("id, first_name, last_name, phone, email")
                  .in("id", coachIds)
              : Promise.resolve({ data: [] as Person[], error: null }),
          () =>
            playerIds.length > 0
              ? supabase
                  .from("parent_player")
                  .select("parent_id, player_id")
                  .in("player_id", playerIds)
              : Promise.resolve({
                  data: [] as { parent_id: string; player_id: string }[],
                  error: null,
                }),
          // A coach row comes from profiles, not players, so it carries no
          // contact nor birth date on its own. Their member fiche is the one
          // whose profile_id points at their account — same record the Bureau
          // shows in Membres.
          () =>
            coachIds.length > 0
              ? supabase.from("players").select(playerColumns).in("profile_id", coachIds)
              : Promise.resolve({ data: [] as Person[], error: null }),
        ],
        // dbLimit partagé (voir lib/batch.ts / le bloc Bureau plus haut).
        dbLimit
      );

    logQueryErrors("Coach (fiches)", {
      playersRes,
      coachProfilesRes,
      parentPlayerRes,
      coachFichesRes,
    });

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
    const coachNextEventRsvpRes = await coachNextEventRsvpPromise;
    logQueryErrors("Coach (prochain événement)", { coachNextEventRsvpRes });
    const coachNextEventRsvpRows = coachNextEventRsvpRes.data;
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
    const allMembershipsRes = await allMembershipsPromise;
    logQueryErrors("Coach (effectifs)", { allMembershipsRes });
    const allMembershipsData = allMembershipsRes.data;
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
        pending_parent_email: string | null;
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
        pendingParentEmail: player.pending_parent_email,
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
    const parentProfilesRes =
      parentIds.length > 0
        ? await supabase.from("profiles").select("id, phone, email").in("id", parentIds)
        : { data: [] as { id: string; phone: string | null; email: string | null }[], error: null };
    logQueryErrors("Coach (contacts parents)", { parentProfilesRes });
    const parentProfiles = parentProfilesRes.data;
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
    logQueryErrors("Coach (rsvps/pénalités)", { coachRsvpRowsRes, coachPenaliteRes });
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
      const eventRoster: RosterPlayer[] = team
        ? (rosterByTeam.get(team.id) ?? [])
        : (e.target_team_ids as string[] | null)
          ? Array.from(
              new Map<string, RosterPlayer>(
                (e.target_team_ids as string[])
                  .flatMap((id: string) => rosterByTeam.get(id) ?? [])
                  .map((p: RosterPlayer) => [p.id, p] as const)
              ).values()
            )
          : [];
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
        rsvpCounts: buildRsvpCounts(rsvpsByEvent, e.id, eventRoster),
        // Retour de Cindy du 30/08 : "qui sera présent" visible partout,
        // pas seulement côté Famille — voir buildPresentPlayers/bloc Bureau.
        presentPlayers: buildPresentPlayers(rsvpsByEvent, e.id, eventRoster),
        benevoleIds: [],
      };
    });

    // Les rôles (maillots/goûter) de TOUS les événements à venir (requête
    // déjà lancée en parallèle plus haut — voir
    // coachOrganisationTasksExtraPromise/coachVolunteerNeedsPromise).
    // eventTasksByEventId (zone prioritaire) n'est fusionné qu'après le
    // "await Promise.all(...)" plus bas — voir priorityZonePromise — pour
    // que ce bloc n'ait pas à l'attendre pendant son propre calcul.
    coachOrganisationTasks = await coachOrganisationTasksExtraPromise;
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
  if (familyDataActive) {
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
                      }[], error: null };
                logQueryErrors("Famille (roster coéquipiers)", { linksRes, rosterRes });
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
              // Retour de Cindy du 30/08 : le téléphone/e-mail d'un coach
              // renseignés dans sa fiche Membre par le Bureau
              // (registration_phone/email) n'apparaissaient jamais ici s'il
              // ne s'était pas connecté lui-même pour remplir son propre
              // compte — l'embed profiles(phone, email) ci-dessous ne lit
              // que le compte de connexion. Complété par family_coach_
              // contact (même priorité que contactsFor dans team-card.tsx
              // côté Bureau/Coach : fiche Membre d'abord, compte de
              // connexion en repli) — vue dédiée plutôt qu'un embed direct
              // sur players, même principe que family_teammate_roster.
              async () => {
                const teamCoachesRes = await supabase
                  .from("team_coaches")
                  .select("team_id, profiles(id, first_name, last_name, phone, email)")
                  .in("team_id", allTeamIds);
                const coachProfileIds = Array.from(
                  new Set(
                    (teamCoachesRes.data ?? [])
                      .map(
                        (r) =>
                          (
                            r.profiles as unknown as { id: string } | null
                          )?.id
                      )
                      .filter((id): id is string => Boolean(id))
                  )
                );
                const contactRes =
                  coachProfileIds.length > 0
                    ? await supabase
                        .from("family_coach_contact")
                        .select("profile_id, phone, email")
                        .in("profile_id", coachProfileIds)
                    : {
                        data: [] as {
                          profile_id: string;
                          phone: string | null;
                          email: string | null;
                        }[],
                        error: null,
                      };
                logQueryErrors("Famille (contact coach)", { teamCoachesRes, contactRes });
                const contactByProfileId = new Map(
                  (contactRes.data ?? []).map((c) => [c.profile_id, c])
                );
                return {
                  data: (teamCoachesRes.data ?? []).map((r) => {
                    const p = r.profiles as unknown as {
                      id: string;
                      first_name: string | null;
                      last_name: string | null;
                      phone: string | null;
                      email: string | null;
                    } | null;
                    if (!p) return r;
                    const contact = contactByProfileId.get(p.id);
                    return {
                      ...r,
                      profiles: {
                        ...p,
                        phone: contact?.phone ?? p.phone,
                        email: contact?.email ?? p.email,
                      },
                    };
                  }),
                };
              },
              // Même correctif que team_coaches juste au-dessus, pour un
              // coach nommé sur sa fiche Membre mais pas encore connecté
              // (team_pending_coaches) : côté Bureau (team-card.tsx), son
              // téléphone/e-mail vient directement de sa fiche Membre (il
              // n'a pas de compte, donc pas d'autre source) — ici, aucune
              // colonne phone/email n'était même demandée, donc "—" garanti
              // pour tout coach dans ce cas (Farid BAHRI, Jean BOUYER-
              // POINOT, retour de Cindy du 30/08).
              async () => {
                const teamPendingCoachesRes = await supabase
                  .from("team_pending_coaches")
                  .select("team_id, players(id, first_name, last_name)")
                  .in("team_id", allTeamIds);
                const pendingCoachPlayerIds = Array.from(
                  new Set(
                    (teamPendingCoachesRes.data ?? [])
                      .map(
                        (r) =>
                          (r.players as unknown as { id: string } | null)?.id
                      )
                      .filter((id): id is string => Boolean(id))
                  )
                );
                const contactRes =
                  pendingCoachPlayerIds.length > 0
                    ? await supabase
                        .from("family_pending_coach_contact")
                        .select("player_id, phone, email")
                        .in("player_id", pendingCoachPlayerIds)
                    : {
                        data: [] as {
                          player_id: string;
                          phone: string | null;
                          email: string | null;
                        }[],
                        error: null,
                      };
                logQueryErrors("Famille (contact coach en attente)", {
                  teamPendingCoachesRes,
                  contactRes,
                });
                const contactByPlayerId = new Map(
                  (contactRes.data ?? []).map((c) => [c.player_id, c])
                );
                return {
                  data: (teamPendingCoachesRes.data ?? []).map((r) => {
                    const p = r.players as unknown as {
                      id: string;
                      first_name: string | null;
                      last_name: string | null;
                    } | null;
                    if (!p) return r;
                    const contact = contactByPlayerId.get(p.id);
                    return {
                      ...r,
                      players: {
                        ...p,
                        phone: contact?.phone ?? null,
                        email: contact?.email ?? null,
                      },
                    };
                  }),
                };
              },
            ],
            // dbLimit partagé (voir lib/batch.ts / le bloc Bureau plus haut).
            dbLimit
          )
        : null,
      supabase
        .from("events")
        .select(
          "id, title, event_type, is_home, location, salle, start_time, end_time, notes, attendance_requested_at, team_score, opponent_score, team_id, target_team_ids, teams(id, name, category), collectes(id, prix, payment_link, cotisations(players(id, first_name, last_name)))"
        )
        .or(teamOrClubWideFilter(allTeamIds))
        .gte("start_time", eventsWindowStart)
        .order("start_time", { ascending: true }),
      // Filtre explicite par player_id plutôt que de compter sur la seule
      // RLS : Cindy elle-même est Bureau ET parente, et la policy admin sur
      // cotisations laisserait passer TOUTES les lignes du club pour son
      // compte si cette requête-ci ne filtrait pas elle-même.
      familyPlayerIds.length > 0
        ? supabase
            .from("cotisations")
            .select(
              "id, saison, prix, remise, paiement, statut, mode_paiement, player_id, collecte_id, players(first_name, last_name, category, membership_type, fbi_status, team_players(teams(name, category))), collectes(id, name, type)"
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

    logQueryErrors("Famille", { eventsRes, familyCotisationRes, familyPenaliteRes });

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

      logQueryErrors("Famille (équipes)", { teamsRes });

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
        (Person & { phone: string | null; email: string | null })[]
      >();
      (teamCoachesRes.data ?? []).forEach((row) => {
        const p = row.profiles as unknown as
          | (Person & { phone: string | null; email: string | null })
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
      const pendingCoachesByTeamId = new Map<
        string,
        (Person & { phone: string | null; email: string | null })[]
      >();
      (teamPendingCoachesRes.data ?? []).forEach((row) => {
        const p = row.players as unknown as
          | (Person & { phone: string | null; email: string | null })
          | null;
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
          () => getEventTasksByEventId(supabase, upcomingFamilyEventIds, dbLimit),
          () => getVolunteerNeedsByEventId(supabase, eventIds, dbLimit),
        ],
        // dbLimit partagé (voir lib/batch.ts / le bloc Bureau plus haut).
        dbLimit
      );
    logQueryErrors("Famille (rsvps/paiements)", { rsvpRowsRes, familyPaymentRes });
    familyVolunteerNeedsByEventId = familyVolunteerNeedsData;

    // familyRsvpStatusByKey (boutons Présent/Absent de ses propres enfants)
    // reste construit directement ici — un usage différent (statut d'UN
    // joueur précis) de rsvpsByEvent juste en dessous (statut de TOUT
    // l'effectif d'un événement, pour les compteurs/la liste des présents).
    (rsvpRowsRes?.data ?? []).forEach((r) => {
      familyRsvpStatusByKey[`${r.event_id}:${r.player_id}`] = r.status;
    });

    // Retour de Cindy du 31/08 : même calcul que Bureau/Coach
    // (buildRsvpCounts/buildPresentPlayers, voir en tête de fichier) —
    // reprend la requête de Famille, plus prudente (filtrée aussi par
    // player_id, pas seulement par event_id), inchangée. Un événement
    // club-wide (teamId ET targetTeamIds null, ex. stage d'été) n'a pas
    // d'effectif d'équipe : ni pastille ni liste, comme avant ce
    // correctif. Un événement ciblant des équipes précises (targetTeamIds,
    // retour d'audit du 28/08) prend l'union dédupliquée de leurs rosters,
    // même principe que rosterSize plus haut dans ce fichier.
    const rsvpsByEvent = buildRsvpStatusByEvent(rsvpRowsRes?.data ?? []);
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
      e.rsvpCounts = buildRsvpCounts(rsvpsByEvent, e.id, roster);
      e.presentPlayers = buildPresentPlayers(rsvpsByEvent, e.id, roster);
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

    // eventTasksByEventId (zone prioritaire) n'est fusionné qu'après le
    // "await Promise.all(...)" plus bas — voir priorityZonePromise — pour
    // que ce bloc n'ait pas à l'attendre pendant son propre calcul.
    familyOrganisationTasks = extraFamilyTasks;
  }
  })();

  // Les trois blocs Bureau/Coach/Famille ci-dessus tournent en parallèle
  // (voir commentaire au-dessus de adminPromise), rejoints par
  // clubReportsPromise (retour de Cindy du 2026-09-02) et priorityZonePromise
  // (retour de Cindy du 2026-09-02, correctif de lenteur) : on attend ici
  // le plus lent des cinq, juste avant le premier endroit qui lit leurs
  // résultats.
  const [, , , , priorityZone] = await Promise.all([
    adminPromise,
    coachPromise,
    familyPromise,
    clubReportsPromise,
    priorityZonePromise,
  ]);
  const {
    coachCards,
    ownPlayerNextEvent,
    whatsappGroups,
    eventRoleTypes,
    sponsorDisplay,
    eventTasksByEventId,
    carpoolOffersByEventId,
  } = priorityZone;
  // Fusionnés seulement maintenant (voir les commentaires dans
  // coachPromise/familyPromise plus haut) : les deux blocs avaient déjà
  // fini de construire leur propre "extra" avant que priorityZonePromise
  // soit forcément résolue, donc pas besoin d'un await de plus à
  // l'intérieur d'eux — juste ce merge une fois tout le monde revenu.
  coachOrganisationTasks = { ...eventTasksByEventId, ...coachOrganisationTasks };
  familyOrganisationTasks = { ...eventTasksByEventId, ...familyOrganisationTasks };

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
      // Bureau juste au-dessus. coachScopedMemberIds (retour de Cindy du
      // 30/08, même cause que le calendrier de "Équipe(s) coachée(s)"
      // corrigé juste avant) exclut l'équipe où le coach joue lui-même :
      // sans ça, l'anniversaire d'un coéquipier de Basile à Séniors M
      // apparaissait dans SON widget de coach, alors que "Mon équipe" a
      // déjà le sien.
      Array.from(new Map(Object.values(coachMemberDetailsByPlayerId).map((m) => [m.id, m])).values())
        .filter((m) => !m.archivedAt && coachScopedMemberIds.has(m.id))
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
    // Audit du 31/08 : whatsappGroups porte la liste NOMINATIVE des
    // membres de CHAQUE groupe (y compris ceux des équipes d'autres
    // familles) — le passer tel quel envoie ces noms au navigateur de
    // cette famille même si l'écran ne les affiche jamais (showTeamGroups
    // masque juste visuellement la grille "Équipes du Club", il n'empêche
    // pas les données d'avoir déjà traversé le réseau). Filtré ici, côté
    // serveur, aux commissions (ouvertes à tous) + aux seules équipes de
    // CES joueurs — jamais après coup côté client.
    const familyTeamIds = new Set(rsvpPlayers.flatMap((p) => p.teamIds));
    const familyWhatsappGroups = whatsappGroups.filter(
      (g) => g.category === "COMMISSION" || (g.teamId !== null && familyTeamIds.has(g.teamId))
    );
    return (
      <FamilyView
        events={familyEvents}
        rsvpPlayers={rsvpPlayers}
        rsvpStatusByKey={familyRsvpStatusByKey}
        birthdayMembers={familyBirthdayMembers}
        teamCards={familyTeamCards}
        tasksByEventId={familyOrganisationTasks}
        carpoolByEventId={carpoolOffersByEventId}
        whatsappGroups={familyWhatsappGroups}
        eventRoles={eventRoleTypes}
        volunteerNeedsByEventId={familyVolunteerNeedsByEventId}
        cotisations={familyCotisations}
        penalites={familyPenalites}
        sponsorDisplay={sponsorDisplay}
      />
    );
  }

  // Retour de Cindy du 04/09 : chaque bloc ci-dessous garde sa condition
  // d'ÉLIGIBILITÉ (isAdmin/isCoach/hasOwnTeamTab/hasChildrenTab, connues
  // avant toute grosse requête -- voir plus haut) pour que le bouton de
  // l'onglet apparaisse toujours, même inactif. Seul `content` devient
  // conditionnel à `activeTab` : un onglet inactif n'affiche jamais ses
  // props réelles (elles seraient de toute façon vides, ce bloc n'a pas
  // tourné), juste `null` -- DashboardTabs ne rend que l'onglet actif,
  // ce `null` n'est donc jamais visible tant qu'on ne clique pas dessus
  // (ce qui redemande la page avec ?tab=... et fait de LUI l'actif).
  if (isAdmin) {
    tabs.push({
      key: "admin",
      label: "Bureau",
      content:
        activeTab === "admin" ? (
          <AdminView
            clubFunction={clubFunction}
            teams={adminTeams}
            allProfiles={allProfilesForAdmin}
            cotisations={adminCotisations}
            collectes={adminCollectes}
            categoryTariffs={adminCategoryTariffs}
            upcomingEvents={adminUpcomingEvents}
            contactPhoneByPlayerId={adminContactPhoneByPlayerId}
            contactEmailByPlayerId={adminContactEmailByPlayerId}
            members={adminMembers}
            birthdayMembers={adminBirthdayMembers}
            canonicalTeamRefs={canonicalTeamRefs}
            whatsappGroups={whatsappGroups}
            sponsors={adminSponsors}
            sponsorDisplay={sponsorDisplay}
            benevoles={adminBenevoles}
            penalites={adminPenalites}
            automationSettings={adminAutomationSettings}
            eventRoles={eventRoleTypes}
            volunteerNeedsByEventId={adminVolunteerNeedsByEventId}
            clubReports={clubReports}
          />
        ) : null,
    });
  }

  if (isCoach) {
    tabs.push({
      key: "coach",
      // Retour de Cindy du 29/08 : "Équipe" tout court prêtait à confusion
      // une fois "Mon équipe" introduit à côté (celui-là, c'est là où on
      // JOUE soi-même) — "coachée(s)" lève l'ambiguïté d'un coup d'œil.
      // coachedTeams (connu avant coachPromise) plutôt que
      // coachTeamsWithRoster (vide tant que ce bloc n'a pas tourné) : le
      // libellé reste correct même quand cet onglet n'est pas l'actif.
      label: coachedTeams.length > 1 ? "Équipes coachées" : "Équipe coachée",
      content:
        activeTab === "coach" ? (
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
            sponsorDisplay={sponsorDisplay}
            clubReports={clubReports}
            currentUserId={user.id}
          />
        ) : null,
    });
  }

  // "Mon équipe" : la propre fiche joueur de la personne (sa cotisation,
  // sa présence, ses pénalités, le WhatsApp de SON équipe) — dès qu'elle
  // en a une, qu'elle coache par ailleurs ou non. Toujours une identité
  // unique, jamais de sélecteur de pastilles à construire ici.
  // hasOwnTeamTab (connu avant familyPromise) plutôt que
  // myTeamRsvpPlayers.length > 0 (vide tant que ce bloc n'a pas tourné) :
  // le bouton doit apparaître même quand cet onglet n'est pas l'actif.
  if (hasOwnTeamTab) {
    tabs.push({
      key: "own-team",
      label: "Mon équipe",
      content: activeTab === "own-team" ? buildFamilyView(myTeamRsvpPlayers) : null,
    });
  }

  // "Mon enfant"/"Mes enfants" : uniquement les enfants, jamais mélangés
  // avec sa propre fiche — le sélecteur de pastilles de FamilyView ne sert
  // plus qu'à choisir entre eux quand il y en a plusieurs. Même principe
  // que ci-dessus : hasChildrenTab pour le bouton, childrenCountEarly
  // (players, connu avant familyPromise) pour le singulier/pluriel du
  // libellé même inactif.
  if (hasChildrenTab) {
    const childrenCountEarly = players.filter((p) => !p.isSelf).length;
    tabs.push({
      key: "children",
      label: childrenCountEarly > 1 ? "Mes enfants" : "Mon enfant",
      content: activeTab === "children" ? buildFamilyView(myChildrenRsvpPlayers) : null,
    });
  }

  // Bandeau "Cette semaine" de l'en-tête (retour de Cindy/Sandrine Manzelle
  // du 2026-08-24) : jamais pour le Bureau — seulement côté Coach et/ou
  // Parent. Fusion coachEvents + familyEvents (dédoublonnée par id) pour
  // que quelqu'un qui cumule les deux casquettes (ex. Sandrine Manzelle)
  // voie tout d'un coup d'œil sans avoir à choisir un onglet d'abord.
  //
  // Retour de Cindy du 2026-09-01 ("pouvoir dire présent ou absent et les
  // besoins en organisation, comme les autres cartes") : chaque événement
  // garde maintenant son origine (source) au lieu de la perdre à la
  // fusion — une famille répond présent/absent pour ses enfants, un coach
  // ne répond jamais pour son propre match (même règle que
  // calendar-view.tsx). familyEvents est fusionné EN DERNIER : si le même
  // événement existe des deux côtés (double casquette), c'est la version
  // "family" qui l'emporte dans le Map, exactement comme avant.
  function respondingPlayersFor(
    event: AdminUpcomingEvent,
    players: { id: string; name: string; teamIds: string[] }[]
  ) {
    return players.filter(
      (p) =>
        (event.teamId && p.teamIds.includes(event.teamId)) ||
        (event.targetTeamIds?.some((id) => p.teamIds.includes(id)) ?? false)
    );
  }
  function buildCoachWeekEvent(e: AdminUpcomingEvent): WeekStripEvent {
    return {
      id: e.id,
      title: e.title,
      eventType: e.event_type,
      startTime: e.start_time,
      location: e.location,
      salle: e.salle,
      isHome: e.isHome,
      teamName: e.teamName,
      source: "coach",
      rsvpPlayers: [],
      roles: [],
      tasks: {},
      carpool: [],
      showCarpool: false,
      needs: coachVolunteerNeedsByEventId[e.id] ?? [],
    };
  }
  function buildFamilyWeekEvent(e: AdminUpcomingEvent): WeekStripEvent {
    const respondingPlayers = respondingPlayersFor(e, familyRsvpPlayers);
    return {
      id: e.id,
      title: e.title,
      eventType: e.event_type,
      startTime: e.start_time,
      location: e.location,
      salle: e.salle,
      isHome: e.isHome,
      teamName: e.teamName,
      source: "family",
      rsvpPlayers: respondingPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        status: familyRsvpStatusByKey[`${e.id}:${p.id}`] ?? "PENDING",
      })),
      roles: rolesForEventType(eventRoleTypes, e.event_type),
      tasks: familyOrganisationTasks[e.id] ?? {},
      carpool: carpoolOffersByEventId[e.id] ?? [],
      showCarpool: shouldOfferCarpool(e),
      needs: familyVolunteerNeedsByEventId[e.id] ?? [],
    };
  }
  // Retour de Cindy du 2026-09-01 (capture d'écran de Basile — Bureau ET
  // coach ET joueur Séniors M, "Bureau" écrasait tout) : le !isAdmin
  // d'origine (retour du 24/08, "jamais pour le Bureau") visait le Bureau
  // PUR, sans équipe coachée ni fiche joueur — pas quelqu'un qui cumule
  // aussi une de ces deux casquettes. isCoach/players.length restent à
  // zéro pour un Bureau pur, donc retirer isAdmin d'ici ne change rien
  // pour lui ; ça répare seulement le cumul (Basile et les futurs cas
  // similaires).
  const showHeaderWeekBanner = isCoach || players.length > 0;
  const headerWeekEvents: WeekStripEvent[] = showHeaderWeekBanner
    ? Array.from(
        new Map(
          [
            ...coachEvents.map((e): [string, WeekStripEvent] => [e.id, buildCoachWeekEvent(e)]),
            ...familyEvents.map((e): [string, WeekStripEvent] => [e.id, buildFamilyWeekEvent(e)]),
          ]
        ).values()
      )
    : [];

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
              2026-08-24, affiné le 2026-09-01 pour le cumul Bureau+coach
              +joueur) : voir showHeaderWeekBanner plus haut. */}
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
      <DashboardTabs tabs={tabs} activeKey={activeTab} />

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
