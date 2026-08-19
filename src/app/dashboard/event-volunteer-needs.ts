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

function fullName(p: { first_name: string | null; last_name: string | null }) {
  return formatPersonName(p.first_name, p.last_name);
}

export async function getVolunteerNeedsByEventId(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<Record<string, VolunteerNeed[]>> {
  const result: Record<string, VolunteerNeed[]> = {};
  if (eventIds.length === 0) return result;

  const { data: needRows } = await supabase
    .from("event_volunteer_needs")
    .select("id, event_id, role_code, custom_label, required_count, sort_order")
    .in("event_id", eventIds)
    .order("sort_order", { ascending: true });

  const needIds = (needRows ?? []).map((row) => row.id as string);

  // Requête séparée plutôt qu'une jointure imbriquée à deux niveaux (mêmes
  // raisons que getCarpoolOffersByEventId dans event-tasks.ts : plus simple
  // à relire).
  const signupsByNeedId = new Map<string, VolunteerSignup[]>();
  if (needIds.length > 0) {
    const { data: signupRows } = await supabase
      .from("event_volunteer_signups")
      .select("id, need_id, player_id, source, players(first_name, last_name)")
      .in("need_id", needIds);

    (signupRows ?? []).forEach((row) => {
      const player = row.players as unknown as {
        first_name: string | null;
        last_name: string | null;
      } | null;
      const needId = row.need_id as string;
      const list = signupsByNeedId.get(needId) ?? [];
      list.push({
        id: row.id as string,
        playerId: row.player_id as string,
        playerName: player ? fullName(player) : "Bénévole",
        source: (row.source as VolunteerSignupSource | null) ?? "VOLUNTEER",
      });
      signupsByNeedId.set(needId, list);
    });
  }

  (needRows ?? []).forEach((row) => {
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
