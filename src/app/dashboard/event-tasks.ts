import type { SupabaseClient } from "@supabase/supabase-js";

// Un rôle est désormais une donnée (table event_role_types) et non plus
// une valeur en dur : "JERSEYS" et "SNACKS" ne sont que les deux premières
// lignes du catalogue, à côté de "Table de marque" ou "Arbitre de touche".
export type TaskType = string;

export type EventRoleType = {
  code: string;
  label: string;
  icon: string | null;
  // Types d'événement concernés ; vide = tous (une table de marque n'a pas
  // de sens sur un entraînement).
  eventTypes: string[];
  sortOrder: number;
};

export type TaskSource = "COACH" | "VOLUNTEER";

export type TaskAssignment = {
  playerId: string;
  playerName: string;
  // null pour les attributions anterieures a la colonne source : on ne
  // sait pas qui les a creees, donc aucun badge n'est affiche.
  source: TaskSource | null;
} | null;

// Clé = code du rôle. Une clé absente signifie "non attribué".
export type EventTasksState = Record<string, TaskAssignment>;

export type CarpoolOffer = {
  playerId: string;
  playerName: string;
  seats: number;
};

// playerId -> code du rôle -> nombre de fois assuré sur la saison.
export type SeasonTaskTally = Record<string, Record<string, number>>;

function fullName(p: { first_name: string | null; last_name: string | null }) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom";
}

// Le catalogue de rôles du club, hors rôles archivés, dans l'ordre voulu.
export async function getEventRoleTypes(
  supabase: SupabaseClient
): Promise<EventRoleType[]> {
  const { data } = await supabase
    .from("event_role_types")
    .select("code, label, icon, event_types, sort_order")
    .is("archived_at", null)
    .order("sort_order");

  return (data ?? []).map((r) => ({
    code: r.code as string,
    label: r.label as string,
    icon: (r.icon as string | null) ?? null,
    eventTypes: (r.event_types as string[] | null) ?? [],
    sortOrder: (r.sort_order as number | null) ?? 100,
  }));
}

// Rôles applicables à un type d'événement donné : ceux sans restriction,
// plus ceux qui le mentionnent explicitement.
export function rolesForEventType(
  roles: EventRoleType[],
  eventType: string | null
): EventRoleType[] {
  return roles.filter(
    (r) =>
      r.eventTypes.length === 0 ||
      (eventType !== null && r.eventTypes.includes(eventType))
  );
}

export async function getEventTasksByEventId(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<Record<string, EventTasksState>> {
  const result: Record<string, EventTasksState> = {};
  if (eventIds.length === 0) return result;

  const { data } = await supabase
    .from("event_tasks")
    .select("event_id, task_type, player_id, source, players(first_name, last_name)")
    .in("event_id", eventIds);

  (data ?? []).forEach((row) => {
    const player = row.players as unknown as {
      first_name: string | null;
      last_name: string | null;
    } | null;
    const eventId = row.event_id as string;
    const state = (result[eventId] ??= {});
    state[row.task_type as string] = player
      ? {
          playerId: row.player_id as string,
          playerName: fullName(player),
          source: (row.source as TaskSource | null) ?? null,
        }
      : null;
  });

  return result;
}

export async function getCarpoolOffersByEventId(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<Record<string, CarpoolOffer[]>> {
  const result: Record<string, CarpoolOffer[]> = {};
  if (eventIds.length === 0) return result;

  const { data } = await supabase
    .from("event_carpool_offers")
    .select("event_id, player_id, seats, players(first_name, last_name)")
    .in("event_id", eventIds)
    .gt("seats", 0);

  (data ?? []).forEach((row) => {
    const player = row.players as unknown as {
      first_name: string | null;
      last_name: string | null;
    } | null;
    const eventId = row.event_id as string;
    const list = (result[eventId] ??= []);
    list.push({
      playerId: row.player_id as string,
      playerName: player ? fullName(player) : "Famille",
      seats: row.seats as number,
    });
  });

  return result;
}

export async function getSeasonTaskTallyByTeamIds(
  supabase: SupabaseClient,
  teamIds: string[]
): Promise<Record<string, SeasonTaskTally>> {
  const result: Record<string, SeasonTaskTally> = {};
  if (teamIds.length === 0) return result;

  const { data } = await supabase
    .from("event_tasks")
    .select("task_type, player_id, events!inner(team_id)")
    .in("events.team_id", teamIds);

  (data ?? []).forEach((row) => {
    const event = row.events as unknown as { team_id: string } | null;
    if (!event) return;
    const tally = (result[event.team_id] ??= {});
    const playerId = row.player_id as string;
    const byRole = (tally[playerId] ??= {});
    const code = row.task_type as string;
    byRole[code] = (byRole[code] ?? 0) + 1;
  });

  return result;
}
