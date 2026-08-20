import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPersonName } from "@/lib/names";
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
  { code: "BUVETTE", label: "Buvette", icon: "Coffee" },
  { code: "TABLE_MARQUE", label: "Table de marque", icon: "Timer" },
  { code: "ARBITRAGE", label: "Arbitrage", icon: "Flag" },
  { code: "INSTALLATION", label: "Installation / Rangement", icon: "KeyRound" },
  { code: "LAVAGE_MAILLOTS", label: "Lavage maillots", icon: "Shirt" },
];

// Un besoin hors liste standard : le code reste stable ("AUTRE"), le
// libellé réel vit dans VolunteerNeed.customLabel.
export const CUSTOM_ROLE_CODE = "AUTRE";

export function volunteerRoleLabel(roleCode: string, customLabel: string | null): string {
  if (roleCode === CUSTOM_ROLE_CODE) return customLabel || "Autre";
  return STANDARD_VOLUNTEER_ROLES.find((r) => r.code === roleCode)?.label ?? roleCode;
}

export function volunteerRoleIcon(roleCode: string): RoleIconName {
  return STANDARD_VOLUNTEER_ROLES.find((r) => r.code === roleCode)?.icon ?? "Users";
}

export type VolunteerSignupSource = "VOLUNTEER" | "ADMIN";

export type VolunteerSignup = {
  id: string;
  playerId: string;
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
  eventIds: string[]
): Promise<Record<string, VolunteerNeed[]>> {
  const result: Record<string, VolunteerNeed[]> = {};
  if (eventIds.length === 0) return result;

  // Pas de .in("event_id", eventIds) ici : depuis que ce fetch couvre
  // TOUS les événements affichés (calendrier entier, plus seulement ceux
  // à venir — voir plus haut), la liste d'ids pouvait dépasser plusieurs
  // centaines d'entrées et produire une URL trop longue, rejetée par le
  // serveur avec un "Bad Request" sans détail (bug remonté par Cindy le
  // 2026-08-20, confirmé par les logs). La policy RLS "select volunteer
  // needs for visible events" filtre déjà aux seuls événements visibles
  // par l'utilisateur courant, donc récupérer sans filtre d'id renvoie
  // exactement le même ensemble de lignes, sans construire une URL
  // gigantesque — on ne garde ensuite que celles demandées.
  const eventIdSet = new Set(eventIds);
  const { data: allNeedRows, error: needRowsError } = await supabase
    .from("event_volunteer_needs")
    .select("id, event_id, role_code, custom_label, required_count, sort_order")
    .order("sort_order", { ascending: true });

  if (needRowsError) {
    console.error("[getVolunteerNeedsByEventId] select event_volunteer_needs failed:", needRowsError);
  }

  const needRows = (allNeedRows ?? []).filter((row) => eventIdSet.has(row.event_id as string));

  const needIds = needRows.map((row) => row.id as string);

  // Requête séparée plutôt qu'une jointure imbriquée à deux niveaux (mêmes
  // raisons que getCarpoolOffersByEventId dans event-tasks.ts : plus simple
  // à relire).
  const signupsByNeedId = new Map<string, VolunteerSignup[]>();
  if (needIds.length > 0) {
    const { data: signupRows } = await supabase
      .from("event_volunteer_signups")
      .select("id, need_id, player_id, source")
      .in("need_id", needIds);

    // Noms résolus via club_member_names plutôt qu'une jointure
    // players(...) directe : la fiche complète d'un autre membre n'est
    // pas accessible (vie privée), la jointure revenait vide et
    // affichait "Bénévole" à la place du vrai nom (retour de Cindy du
    // 2026-08-20). D'abord scopée "coéquipier", élargie à tout le club le
    // 2026-08-21 (retour de Cindy : "Bénévole" persistait pour un
    // bénévole hors de l'équipe de qui consulte — capture d'écran espace
    // Parent).
    const signupPlayerIds = [...new Set((signupRows ?? []).map((row) => row.player_id as string))];
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

    (signupRows ?? []).forEach((row) => {
      const needId = row.need_id as string;
      const list = signupsByNeedId.get(needId) ?? [];
      list.push({
        id: row.id as string,
        playerId: row.player_id as string,
        playerName: nameByPlayerId.get(row.player_id as string) ?? "Bénévole",
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
