import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkedQuery, type Semaphore } from "@/lib/batch";
import { formatPersonName } from "@/lib/names";
import { sendTeamPush } from "@/lib/push-notify-client";
import type { RoleIconName } from "./role-icon";

// "Organisation match à domicile" (retour de Cindy du 17/09, inspiration
// FFBB) : 8 rôles officiels indispensables à un match officiel/amical à
// domicile -- table de marque, arbitrage, chronométrage, délégués. Système
// volontairement séparé de event-volunteer-needs.ts (STANDARD_VOLUNTEER_
// ROLES) : là, plusieurs bénévoles peuvent se proposer par besoin ; ici,
// toujours exactement UNE personne par rôle -- pas de compteur, juste
// pourvu ou pas. Catalogue FIXE en code, même raison que STANDARD_
// VOLUNTEER_ROLES (retour de Cindy du 2026-08-19, "trop lourd, des
// doublons d'infos" pour un catalogue éditable en base).
export type MatchOfficialRoleCode =
  | "EMARQUE"
  | "ARBITRE_1"
  | "ARBITRE_2"
  | "MARQUEUR"
  | "AIDE_MARQUEUR"
  | "CHRONOMETREUR"
  | "DELEGUE_CLUB"
  | "DELEGUE_FAIRPLAY";

// Retour de Cindy du 17/09 ("e-marque après les arbitres") : ordre
// d'affichage, sans rapport avec le rôle réel sur le terrain. icon : liste
// blanche partagée avec event-volunteer-needs.ts (role-icon.tsx), pas
// besoin d'en élargir le jeu pour ces 8 rôles.
export const MATCH_OFFICIAL_ROLES: { code: MatchOfficialRoleCode; label: string; icon: RoleIconName }[] = [
  { code: "ARBITRE_1", label: "Arbitre 1", icon: "Flag" },
  { code: "ARBITRE_2", label: "Arbitre 2", icon: "Flag" },
  { code: "EMARQUE", label: "E-marque", icon: "ClipboardList" },
  { code: "AIDE_MARQUEUR", label: "Aide marqueur", icon: "Timer" },
  { code: "CHRONOMETREUR", label: "Chronométreur", icon: "Timer" },
  { code: "DELEGUE_CLUB", label: "Délégué de club", icon: "Users" },
  { code: "DELEGUE_FAIRPLAY", label: "Délégué Fair-play", icon: "Megaphone" },
];

// Retour de Cindy du 18/09 ("l'arbitre officiel n'est pas un membre, juste
// un choix arbitre officiel c'est tout") : ces deux rôles n'ont ni
// sélecteur de membre ni champ de nom -- la ligue désigne déjà les
// arbitres d'un match officiel/amical, le Bureau/Coach confirme juste le
// rôle en un clic (voir MatchOfficialsPanel, confirmReferee).
export const REFEREE_ROLE_CODES: MatchOfficialRoleCode[] = ["ARBITRE_1", "ARBITRE_2"];

// Nom fixe enregistré dans guest_name pour ce clic de confirmation -- pas
// une vraie personne, juste ce qui s'affiche sur la carte pour tout le
// monde (Bureau/Coach/Famille).
export const REFEREE_CONFIRMED_LABEL = "Arbitre officiel";

export function matchOfficialRoleLabel(roleCode: string): string {
  return MATCH_OFFICIAL_ROLES.find((r) => r.code === roleCode)?.label ?? roleCode;
}

export type MatchOfficialAssignment = {
  id: string;
  roleCode: MatchOfficialRoleCode;
  playerId: string | null;
  guestName: string | null;
  createdBy: string | null;
  displayName: string;
};

export async function getMatchOfficialRolesByEventId(
  supabase: SupabaseClient,
  eventIds: string[],
  dbLimit?: Semaphore,
  // Retour de Cindy du 21/09 ("réduire le nombre de requêtes") : voir
  // sharedNameByPlayerId dans getEventTasksByEventId (event-tasks.ts), même
  // principe.
  sharedNameByPlayerId?: Map<string, string>
): Promise<Record<string, MatchOfficialAssignment[]>> {
  const result: Record<string, MatchOfficialAssignment[]> = {};
  if (eventIds.length === 0) return result;

  // Découpé en tranches (même raison que getVolunteerNeedsByEventId,
  // event-volunteer-needs.ts) : un .in("event_id", eventIds) direct posait
  // problème dès que ce fetch couvrait TOUS les événements affichés
  // (calendrier entier), URL trop longue -- ce fetch-ci est appelé depuis
  // les mêmes contextes (page.tsx), donc exposé au même risque.
  const { data: rows, errors } = await chunkedQuery(
    eventIds,
    150,
    (chunk) =>
      supabase
        .from("match_official_roles")
        .select("id, event_id, role_code, player_id, guest_name, created_by")
        .in("event_id", chunk),
    dbLimit ?? 4
  );
  errors.forEach((error) =>
    console.error("[getMatchOfficialRolesByEventId] select match_official_roles failed (tranche):", error)
  );

  // Noms résolus via club_member_names (club entier, prénom/nom seulement) :
  // même raison que getVolunteerNeedsByEventId, une jointure players(...)
  // directe reviendrait vide pour un membre hors équipe de qui consulte.
  const playerIds = [
    ...new Set((rows ?? []).map((r) => r.player_id as string | null).filter((id): id is string => Boolean(id))),
  ];
  let nameByPlayerId = sharedNameByPlayerId;
  if (!nameByPlayerId) {
    nameByPlayerId = new Map<string, string>();
    if (playerIds.length > 0) {
      const { data: nameRows } = await supabase
        .from("club_member_names")
        .select("id, first_name, last_name")
        .in("id", playerIds);
      (nameRows ?? []).forEach((row) => {
        nameByPlayerId!.set(row.id as string, formatPersonName(row.first_name, row.last_name));
      });
    }
  }

  (rows ?? []).forEach((row) => {
    const eventId = row.event_id as string;
    const list = (result[eventId] ??= []);
    const playerId = row.player_id as string | null;
    list.push({
      id: row.id as string,
      roleCode: row.role_code as MatchOfficialRoleCode,
      playerId,
      guestName: row.guest_name as string | null,
      createdBy: row.created_by as string | null,
      displayName: (playerId ? nameByPlayerId.get(playerId) : null) ?? (row.guest_name as string | null) ?? "?",
    });
  });

  return result;
}

// Best-effort, jamais bloquant : un échec ici ne doit jamais faire croire
// que l'attribution elle-même n'a pas réussi -- même principe que
// notifyNewVolunteerNeed (event-volunteer-needs.ts). Bell sur team_id (toute
// l'équipe, information non sensible) + push coachesOnly/Bureau (retour de
// Cindy du 17/09, "activé une notification quand il se porte volontaire") :
// même écart bell/push déjà accepté pour "Nouveau joueur dans l'équipe"
// (member-notifications.ts) -- la cloche n'a pas de variante "coach
// seulement" ciblée sur une équipe précise (restricted_audience=COACHS
// serait vu par TOUS les coachs du club, pas seulement celui de cette
// équipe, voir notifications_for_me()).
export async function notifyMatchOfficialAssigned(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    eventTitle: string | null;
    startTime: string;
    teamId: string | null;
    roleCode: string;
    assigneeName: string;
  }
): Promise<void> {
  const roleLabel = matchOfficialRoleLabel(params.roleCode);
  const dateLabel = new Date(params.startTime).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  const title = "Organisation match à domicile";
  const body = `${roleLabel} : ${params.assigneeName} — ${params.eventTitle ?? "un match"}, ${dateLabel}.`;

  const { error } = await supabase.from("notifications").insert({
    team_id: params.teamId,
    event_id: params.eventId,
    title,
    body,
    url: "/dashboard",
    category: "ORGANISATION_NEED",
  });
  if (error) {
    console.error("[notifyMatchOfficialAssigned] notification équipe échouée:", error);
  }

  await sendTeamPush({ teamId: params.teamId, coachesOnly: true, title, body, url: "/dashboard" });
  // Retour de Cindy du 18/09 ("possible de désactiver... ils reçoivent
  // tous de toutes les équipes ?") : le push Bureau, lui, reste explicite
  // (contrairement à la cloche, filtrée via notifications_for_me) --
  // même réglage, vérifié ici avant de l'envoyer.
  const { data: settings } = await supabase
    .from("club_settings")
    .select("bureau_sees_all_organisation_needs")
    .eq("id", true)
    .maybeSingle();
  if (settings?.bureau_sees_all_organisation_needs ?? true) {
    await sendTeamPush({ audience: "BUREAU", title, body, url: "/dashboard" });
  }
}

// "Relancer" (retour de Cindy du 17/09, "également comme besoin classique
// avec notif cloche et push") : même bouton manuel que
// notifyVolunteerNeedReminder (event-volunteer-needs.ts), même interrupteur
// partagé (volunteer_need_alerts_enabled -- pas de réglage dédié pour cette
// catégorie de rôles, restée conceptuellement "besoin d'organisation" pour
// Cindy). Un seul message groupant tous les rôles encore vides plutôt qu'un
// par rôle (rarement plus de 2-3 vides à la fois, contrairement aux
// besoins classiques qui peuvent en cumuler beaucoup plus).
export async function notifyMatchOfficialReminder(
  supabase: SupabaseClient,
  params: {
    eventId: string;
    eventTitle: string | null;
    startTime: string;
    teamId: string | null;
    assignments: MatchOfficialAssignment[];
  }
): Promise<{ error: string | null }> {
  const { data: settings } = await supabase
    .from("club_settings")
    .select("volunteer_need_alerts_enabled, bureau_sees_all_organisation_needs")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.volunteer_need_alerts_enabled) {
    return {
      error:
        "Les notifications de besoins bénévoles sont désactivées (Paramètres → Automatisations).",
    };
  }

  const filledCodes = new Set(params.assignments.map((a) => a.roleCode));
  const unfilledLabels = MATCH_OFFICIAL_ROLES.filter((r) => !filledCodes.has(r.code)).map((r) => r.label);
  if (unfilledLabels.length === 0) {
    return { error: null };
  }

  const dateLabel = new Date(params.startTime).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Paris",
  });
  const title = "Organisation match officiel non pourvue";
  const body = `${unfilledLabels.join(", ")} — encore à pourvoir pour ${
    params.eventTitle ?? "un match"
  } du ${dateLabel}.`;

  const { error } = await supabase.from("notifications").insert({
    team_id: params.teamId,
    event_id: params.eventId,
    title,
    body,
    url: "/dashboard",
    category: "ORGANISATION_NEED",
  });
  if (error) {
    console.error("[notifyMatchOfficialReminder] notification équipe échouée:", error);
  }

  await sendTeamPush({ teamId: params.teamId, coachesOnly: true, title, body, url: "/dashboard" });
  if (settings.bureau_sees_all_organisation_needs) {
    await sendTeamPush({ audience: "BUREAU", title, body, url: "/dashboard" });
  }

  return { error: null };
}
