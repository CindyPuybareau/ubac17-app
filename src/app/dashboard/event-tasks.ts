import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskType = "JERSEYS" | "SNACKS";

export type TaskAssignment = {
  playerId: string;
  playerName: string;
} | null;

export type EventTasksState = {
  JERSEYS: TaskAssignment;
  SNACKS: TaskAssignment;
};

export type CarpoolOffer = {
  playerId: string;
  playerName: string;
  seats: number;
};

export type SeasonTaskTally = Record<string, { jerseys: number; snacks: number }>;

function fullName(p: { first_name: string | null; last_name: string | null }) {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Sans nom";
}

export async function getEventTasksByEventId(
  supabase: SupabaseClient,
  eventIds: string[]
): Promise<Record<string, EventTasksState>> {
  const result: Record<string, EventTasksState> = {};
  if (eventIds.length === 0) return result;

  const { data } = await supabase
    .from("event_tasks")
    .select("event_id, task_type, player_id, players(first_name, last_name)")
    .in("event_id", eventIds);

  (data ?? []).forEach((row) => {
    const player = row.players as unknown as {
      first_name: string | null;
      last_name: string | null;
    } | null;
    const eventId = row.event_id as string;
    const state = (result[eventId] ??= { JERSEYS: null, SNACKS: null });
    const assignment: TaskAssignment = player
      ? { playerId: row.player_id as string, playerName: fullName(player) }
      : null;
    if (row.task_type === "JERSEYS") state.JERSEYS = assignment;
    else if (row.task_type === "SNACKS") state.SNACKS = assignment;
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
    const entry = (tally[playerId] ??= { jerseys: 0, snacks: 0 });
    if (row.task_type === "JERSEYS") entry.jerseys += 1;
    else if (row.task_type === "SNACKS") entry.snacks += 1;
  });

  return result;
}
