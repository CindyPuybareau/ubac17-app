import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkedQuery, type Semaphore } from "@/lib/batch";
import { formatPersonName } from "@/lib/names";
import { sendTeamPush } from "@/lib/push-notify-client";
import type { RoleIconName } from "./role-icon";

// "Besoins d'organisation" d'un événement (buvette, table de marque,
// arbitrage...) — voir 20261012000000_club_event_targeting_and_volunteer_needs
// et 20261016000000_simplify_volunteer_needs_no_catalog. Liste FIXE plutôt
// qu'un catalogue éditable en base (retour de Cindy du 2026-08-19,
// inspiration SportEasy : "trop lourd, des doublons d'infos") — un rôle
// hors liste se choisit via "Autre" (customLabel en texte libre). Système
// volontairement séparé de event-tasks.ts (JERSEYS/SNACKS, maillots/goûter
// géré par le coach côté match) : un besoin ici peut demander PLUSIEURS
// bénévoles, event_tasks est verrouillé à un seul par (event_id, task_type).
export type StandardVolunteerRole = {
  code: string;
  label: string;
  icon: RoleIconName;
};

export const STANDARD_VOLUNTEER_ROLES: StandardVolunteerRole[] = [
  // Retour de Cindy du 13/09 : besoin en premier dans la liste, distinct du
  // "goûter" de event-tasks.ts (JERSEYS/SNACKS, un seul responsable désigné
  // par le coach pour SON match) — ici plusieurs bénévoles peuvent se
  // proposer, pour tout type d'événement (tournoi, plateau...), pas
  // seulement un match coaché.
  { code: "GOUTER_ENCAS", label: "Goûter / Encas", icon: "Utensils" },
  { code: "BUVETTE", label: "Buvette", icon: "Coffee" },
  { code: "INSTALLATION", label: "Installation / Rangement", icon: "KeyRound" },
  { code: "LAVAGE_MAILLOTS", label: "Lavage maillots", icon: "Shirt" },
];

// Retirés du choix à la création (retour de Cindy du 17/09) : redondants
// avec "Organisation match officiel" (match-official-roles.ts) -- Table de
// marque = Marqueur/Aide marqueur/E-marque, Arbitrage = Arbitre 1/Arbitre 2.
// Gardés ici UNIQUEMENT pour que les besoins déjà créés avec ces codes
// (encore présents en base) continuent d'afficher un vrai libellé/icône au
// lieu du code brut -- jamais proposés pour un nouveau besoin (voir
// findVolunteerRole plus bas, jamais lu par le menu "Ajouter un besoin").
const LEGACY_VOLUNTEER_ROLES: StandardVolunteerRole[] = [
  { code: "TABLE_MARQUE", label: "Table de marque", icon: "Timer" },
  { code: "ARBITRAGE", label: "Arbitrage", icon: "Flag" },
];

function findVolunteerRole(roleCode: string): StandardVolunteerRole | undefined {
  return (
    STANDARD_VOLUNTEER_ROLES.find((r) => r.code === roleCode) ??
    LEGACY_VOLUNTEER_ROLES.find((r) => r.code === roleCode)
  );
}

// Un besoin hors liste standard : le code reste stable ("AUTRE"), le
// libellé réel vit dans VolunteerNeed.customLabel.
export const CUSTOM_ROLE_CODE = "AUTRE";

export function volunteerRoleLabel(roleCode: string, customLabel: string | null): string {
  if (roleCode === CUSTOM_ROLE_CODE) return customLabel || "Autre";
  return findVolunteerRole(roleCode)?.label ?? roleCode;
}

// Retour de Cindy du 13/09 ("notifier les personnes concernées dès qu'une
// ligne est ajoutée dans event_volunteer_needs") : posée ici en code
// applicatif plutôt qu'en trigger SQL (contrairement à notify_event_change,
// voir la migration 20261113010000) — le libellé d'un rôle standard
// ("Buvette", "Goûter / Encas"...) n'existe QUE dans STANDARD_VOLUNTEER_
// ROLES ci-dessus, jamais en base (catalogue db supprimé le 2026-10-16) ; un
// trigger SQL n'aurait accès qu'au role_code brut ("BUVETTE") et devrait
// dupliquer cette liste rien que pour l'affichage. Appelée aux deux seuls
// endroits qui créent un besoin (create-event-form.tsx, volunteer-needs-
// panel.tsx "Ajouter un besoin") — best-effort, jamais bloquant : un échec
// ici ne doit jamais faire croire que le besoin lui-même n'a pas été créé.
//
// Ciblage identique à notify_event_change (voir son commentaire) : le côté
// équipe (team_id/target_team_ids) reste écrit tel quel, toujours -- y
// compris team_id et target_team_ids tous deux null (= tout le club, même
// codage que partout ailleurs). Le côté "commission concernée" ne vise pas
// des personnes individuelles (voir access-briques.ts / commissions-
// manager.tsx) mais l'espace partagé /commission/[token] lui-même : une
// ligne par commission taguée sur l'événement, jamais par personne.
export async function notifyNewVolunteerNeed(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    eventTitle: string | null;
    startTime: string;
    teamId: string | null;
    targetTeamIds: string[] | null;
    commissionGroupIds: string[];
    roleCode: string;
    customLabel: string | null;
    requiredCount: number;
  }
): Promise<void> {
  // Même interrupteur unique que notify_event_change côté SQL (voir son
  // commentaire) : "Besoins bénévoles", désactivé par défaut.
  const { data: settings } = await supabase
    .from("club_settings")
    .select("volunteer_need_alerts_enabled")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.volunteer_need_alerts_enabled) return;

  const roleLabel = volunteerRoleLabel(params.roleCode, params.customLabel);
  const dateLabel = new Date(params.startTime).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  const title = "Nouveau besoin bénévole";
  const countLabel = params.requiredCount > 1 ? ` (${params.requiredCount})` : "";
  const body = `${roleLabel}${countLabel} — ${params.eventTitle ?? "un événement"}, ${dateLabel}.`;

  const { error: teamError } = await supabase.from("notifications").insert({
    team_id: params.teamId,
    target_team_ids: params.targetTeamIds,
    event_id: params.eventId,
    title,
    body,
    url: "/dashboard",
  });
  if (teamError) {
    console.error("[notifyNewVolunteerNeed] notification équipe échouée:", teamError);
  }

  if (params.commissionGroupIds.length > 0) {
    const { error: commissionError } = await supabase.from("notifications").insert(
      params.commissionGroupIds.map((groupId) => ({
        commission_group_id: groupId,
        event_id: params.eventId,
        title,
        body,
      }))
    );
    if (commissionError) {
      console.error("[notifyNewVolunteerNeed] notification commission échouée:", commissionError);
    }
  }

  // Retour de Cindy du 17/09 ("je veux des push réels pour...") : même
  // titre/corps que la cloche ci-dessus, en plus -- jamais à la place.
  await sendTeamPush({
    teamId: params.teamId,
    targetTeamIds: params.targetTeamIds,
    title,
    body,
    url: "/dashboard",
  });
}

// Retour de Cindy du 17/09 ("un petit bouton... côté coach") : relance
// manuelle, en plus de la relance automatique à J-7 (bureau-alerts/route.ts,
// runVolunteerNeedReminders) -- même texte, même ciblage, réutilisés à
// l'identique pour que les deux canaux racontent la même chose. Volontairement
// indépendante du marqueur reminder_sent_at de l'automatique (jamais lue ni
// écrite ici) : Basile peut relancer autant de fois qu'il veut sans jamais
// empêcher (ni être empêché par) le rappel automatique à J-7, décidé avec
// Cindy plutôt qu'un compteur à gérer. eventId seul ne suffit pas ici
// (contrairement à notifyNewVolunteerNeed, appelé juste après un insert où
// l'appelant a déjà tout sous la main) : cette fonction est déclenchée bien
// plus tard, depuis le panneau qui ne connaît que l'event_id -- va donc
// chercher elle-même team_id/target_team_ids/commission_group_ids/titre/date.
export async function notifyVolunteerNeedReminder(
  supabase: SupabaseClient,
  eventId: string,
  needs: VolunteerNeed[]
): Promise<{ error: string | null }> {
  const { data: settings } = await supabase
    .from("club_settings")
    .select("volunteer_need_alerts_enabled")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.volunteer_need_alerts_enabled) {
    return {
      error:
        "Les notifications de besoins bénévoles sont désactivées (Paramètres → Automatisations).",
    };
  }

  const unresolvedNeeds = needs.filter((n) => n.requiredCount - n.signups.length > 0);
  if (unresolvedNeeds.length === 0) {
    return { error: null };
  }

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("title, start_time, team_id, target_team_ids, commission_group_ids")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !event) {
    return { error: "Événement introuvable." };
  }

  const dateLabel = new Date(event.start_time).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  const title = "Besoin bénévole non pourvu";

  for (const need of unresolvedNeeds) {
    const roleLabel = volunteerRoleLabel(need.roleCode, need.customLabel);
    const remaining = need.requiredCount - need.signups.length;
    const body = `${roleLabel} — encore ${remaining} place${remaining > 1 ? "s" : ""} pour ${
      event.title ?? "un événement"
    } du ${dateLabel}.`;

    await supabase.from("notifications").insert({
      team_id: event.team_id,
      target_team_ids: event.target_team_ids,
      event_id: eventId,
      title,
      body,
      url: "/dashboard",
    });

    if ((event.commission_group_ids ?? []).length > 0) {
      await supabase.from("notifications").insert(
        (event.commission_group_ids as string[]).map((groupId) => ({
          commission_group_id: groupId,
          event_id: eventId,
          title,
          body,
        }))
      );
    }

    // Retour de Cindy du 17/09 ("je veux des push réels pour...").
    await sendTeamPush({
      teamId: event.team_id,
      targetTeamIds: event.target_team_ids,
      title,
      body,
      url: "/dashboard",
    });
  }

  return { error: null };
}

export function volunteerRoleIcon(roleCode: string): RoleIconName {
  return findVolunteerRole(roleCode)?.icon ?? "Users";
}

export type VolunteerSignupSource = "VOLUNTEER" | "ADMIN";

// playerId/benevoleId/commissionGroupId : exactement UN des trois est
// renseigné, jamais deux à la fois (retour de Cindy du 2026-08-25, "besoin
// en bénévoles hors club", puis du 10/09, lien commun d'une commission) —
// voir la contrainte event_volunteer_signups_signer_check en base.
export type VolunteerSignup = {
  id: string;
  playerId: string | null;
  benevoleId: string | null;
  // Retour de Cindy du 10/09 ("Accès Commissions & Administration") :
  // inscription depuis le lien commun d'une commission, sans identité
  // permanente -- guestName porte le prénom saisi au moment de se
  // proposer (voir /api/commission-signup).
  commissionGroupId: string | null;
  guestName: string | null;
  // Nom affiché, résolu selon lequel des trois champs ci-dessus est
  // renseigné — gardé "playerName" (pas renommé) pour ne pas casser tous
  // les usages existants (volunteer-needs-panel.tsx...), c'était déjà le
  // seul nom affiché dans ce composant avant l'ajout des bénévoles/invités.
  playerName: string;
  source: VolunteerSignupSource;
};

export type VolunteerNeed = {
  id: string;
  eventId: string;
  roleCode: string;
  // Libellé libre quand roleCode === CUSTOM_ROLE_CODE, null sinon.
  customLabel: string | null;
  requiredCount: number;
  signups: VolunteerSignup[];
};

export async function getVolunteerNeedsByEventId(
  supabase: SupabaseClient,
  eventIds: string[],
  dbLimit?: Semaphore
): Promise<Record<string, VolunteerNeed[]>> {
  const result: Record<string, VolunteerNeed[]> = {};
  if (eventIds.length === 0) return result;

  // Un .in("event_id", eventIds) direct posait problème dès que ce fetch
  // couvrait TOUS les événements affichés (calendrier entier, plusieurs
  // centaines d'entrées) : URL trop longue, "Bad Request" (bug remonté
  // par Cindy le 2026-08-20). Le contournement (fetch de toute la table,
  // filtré en mémoire) posé alors ne tient plus à cette échelle : retour
  // de Cindy du 02/09, Postgres a fini par annuler ce genre de scan
  // complet lui-même ailleurs dans l'appli ("statement timeout", vraie
  // "Internal Server Error") — puis un deuxième incident le même jour
  // causé par les tranches elles-mêmes, parties toutes en même temps, puis
  // un TROISIÈME (retour du 03/09) causé par des plafonds locaux qui
  // s'additionnaient entre blocs. dbLimit, quand fourni par l'appelant
  // (page.tsx), est le plafond unique partagé par toute la page.
  // Chaque tranche porte son propre tri par sort_order, donc l'ordre des
  // besoins d'un même événement (toujours dans la même tranche, puisqu'on
  // découpe sur les ids d'événement) reste correct une fois les tranches
  // mises bout à bout.
  const { data: needRows, errors } = await chunkedQuery(
    eventIds,
    150,
    (chunk) =>
      supabase
        .from("event_volunteer_needs")
        .select("id, event_id, role_code, custom_label, required_count, sort_order")
        .in("event_id", chunk)
        .order("sort_order", { ascending: true }),
    dbLimit ?? 4
  );
  errors.forEach((error) =>
    console.error(
      "[getVolunteerNeedsByEventId] select event_volunteer_needs failed (tranche):",
      error
    )
  );

  const needIds = needRows.map((row) => row.id as string);

  // Requête séparée plutôt qu'une jointure imbriquée à deux niveaux (mêmes
  // raisons que getCarpoolOffersByEventId dans event-tasks.ts : plus simple
  // à relire).
  const signupsByNeedId = new Map<string, VolunteerSignup[]>();
  if (needIds.length > 0) {
    const { data: signupRows } = await supabase
      .from("event_volunteer_signups")
      .select("id, need_id, player_id, benevole_id, commission_group_id, guest_name, source")
      .in("need_id", needIds);

    // Noms résolus via club_member_names plutôt qu'une jointure
    // players(...) directe : la fiche complète d'un autre membre n'est
    // pas accessible (vie privée), la jointure revenait vide et
    // affichait "Bénévole" à la place du vrai nom (retour de Cindy du
    // 2026-08-20). D'abord scopée "coéquipier", élargie à tout le club le
    // 2026-08-21 (retour de Cindy : "Bénévole" persistait pour un
    // bénévole hors de l'équipe de qui consulte — capture d'écran espace
    // Parent).
    const signupPlayerIds = [
      ...new Set(
        (signupRows ?? [])
          .map((row) => row.player_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const nameByPlayerId = new Map<string, string>();
    if (signupPlayerIds.length > 0) {
      const { data: nameRows } = await supabase
        .from("club_member_names")
        .select("id, first_name, last_name")
        .in("id", signupPlayerIds);
      (nameRows ?? []).forEach((row) => {
        nameByPlayerId.set(row.id as string, formatPersonName(row.first_name, row.last_name));
      });
    }

    // Même principe côté bénévoles (retour d'audit du 28/08, même bug déjà
    // corrigé côté joueurs le 21/08 via club_member_names) : la table
    // benevoles elle-même n'est lisible que par le Bureau (RLS) — pour un
    // Coach ou une Famille, une lecture directe renvoie 0 ligne (refus
    // silencieux) et le nom retombait sur "Bénévole". club_benevole_names
    // est une vue club-wide, prénom/nom seulement, lisible par tous les
    // comptes connectés.
    const signupBenevoleIds = [
      ...new Set(
        (signupRows ?? [])
          .map((row) => row.benevole_id as string | null)
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const nameByBenevoleId = new Map<string, string>();
    if (signupBenevoleIds.length > 0) {
      const { data: benevoleRows } = await supabase
        .from("club_benevole_names")
        .select("id, first_name, last_name")
        .in("id", signupBenevoleIds);
      (benevoleRows ?? []).forEach((row) => {
        nameByBenevoleId.set(row.id as string, formatPersonName(row.first_name, row.last_name));
      });
    }

    (signupRows ?? []).forEach((row) => {
      const needId = row.need_id as string;
      const list = signupsByNeedId.get(needId) ?? [];
      const playerId = row.player_id as string | null;
      const benevoleId = row.benevole_id as string | null;
      const commissionGroupId = row.commission_group_id as string | null;
      const guestName = row.guest_name as string | null;
      list.push({
        id: row.id as string,
        playerId,
        benevoleId,
        commissionGroupId,
        guestName,
        playerName:
          (playerId ? nameByPlayerId.get(playerId) : null) ??
          (benevoleId ? nameByBenevoleId.get(benevoleId) : null) ??
          guestName ??
          "Bénévole",
        source: (row.source as VolunteerSignupSource | null) ?? "VOLUNTEER",
      });
      signupsByNeedId.set(needId, list);
    });
  }

  needRows.forEach((row) => {
    const eventId = row.event_id as string;
    const list = (result[eventId] ??= []);
    list.push({
      id: row.id as string,
      eventId,
      roleCode: row.role_code as string,
      customLabel: (row.custom_label as string | null) ?? null,
      requiredCount: (row.required_count as number | null) ?? 1,
      signups: signupsByNeedId.get(row.id as string) ?? [],
    });
  });

  return result;
}
