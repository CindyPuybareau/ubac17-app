import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPersonName } from "@/lib/names";
import type { EventRoleType } from "./event-tasks";

// "Besoins en bénévoles" d'un événement club (buvette, table de marque,
// arbitrage...) — voir 20261012000000_club_event_targeting_and_volunteer_needs.
// Système volontairement séparé de event-tasks.ts (JERSEYS/SNACKS) : un
// besoin peut demander PLUSIEURS bénévoles (event_tasks est verrouillé à
// un seul par (event_id, task_type)), avec une tranche horaire optionnelle.

// JERSEYS/SNACKS restent gérés par l'ancien système (event_tasks,
// MatchTasksPanel — un seul responsable, pas de notion de nombre requis) :
// le catalogue event_role_types est commun aux deux systèmes, donc on
// exclut explicitement ces deux codes partout où ce nouveau système liste
// "ses" rôles, pour ne jamais dupliquer maillots/goûter ici.
const LEGACY_TASK_CODES = new Set(["JERSEYS", "SNACKS"]);

export function volunteerNeedRoles(roles: EventRoleType[]): EventRoleType[] {
  return roles.filter((r) => !LEGACY_TASK_CODES.has(r.code));
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
  timeRange: string | null;
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
    .select("id, event_id, role_code, time_range, required_count, sort_order")
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
      timeRange: (row.time_range as string | null) ?? null,
      requiredCount: (row.required_count as number | null) ?? 1,
      signups: signupsByNeedId.get(row.id as string) ?? [],
    });
  });

  return result;
}
