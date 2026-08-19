import type { SupabaseClient } from "@supabase/supabase-js";
import { sortByLastName } from "@/lib/names";

export type UpcomingEvent = {
  id: string;
  title: string | null;
  event_type: string | null;
  location: string | null;
  salle: string | null;
  start_time: string;
  team_id: string | null;
  target_team_ids: string[] | null;
  // Date de la demande de presences faite par le coach, null si aucune.
  attendance_requested_at: string | null;
  // Ecrite par le coach/Bureau a la creation ou la modification de
  // l'evenement — affichee sur la carte "prochain rendez-vous".
  notes: string | null;
};

export type RosterPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type RsvpCounts = {
  present: number;
  pending: number;
  absent: number;
  late: number;
};

// Club-wide events (team_id null, target_team_ids null — e.g. a summer
// stage open to every category) must surface alongside a team's own
// events for every role, not just the Bureau. A THIRD case sits between
// the two : team_id null but target_team_ids filled (a club event
// reserved to a few teams, see 20261012000000) — visible only if one of
// nos équipes apparaît dans ce tableau. PostgREST's .in() alone excludes
// NULL rows, so we build an explicit OR filter combining all three
// (target_team_ids.ov = "overlaps", l'équivalent PostgREST de &&).
export function teamOrClubWideFilter(teamIds: string[]): string {
  if (teamIds.length === 0) return "and(team_id.is.null,target_team_ids.is.null)";
  const idList = teamIds.join(",");
  return `and(team_id.is.null,target_team_ids.is.null),team_id.in.(${idList}),target_team_ids.ov.{${idList}}`;
}

export async function getNextEventForTeams(
  supabase: SupabaseClient,
  teamIds: string[]
): Promise<UpcomingEvent | null> {
  const { data } = await supabase
    .from("events")
    .select("id, title, event_type, location, salle, start_time, team_id, target_team_ids, attendance_requested_at, notes")
    .or(teamOrClubWideFilter(teamIds))
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data;
}

export async function getUpcomingEventsForTeam(
  supabase: SupabaseClient,
  teamId: string,
  limit = 5
): Promise<UpcomingEvent[]> {
  const { data } = await supabase
    .from("events")
    .select("id, title, event_type, location, salle, start_time, team_id, target_team_ids, attendance_requested_at, notes")
    .eq("team_id", teamId)
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true })
    .limit(limit);

  return data ?? [];
}

export async function getPlayerTeamIds(
  supabase: SupabaseClient,
  playerId: string
): Promise<string[]> {
  const { data } = await supabase
    .from("team_players")
    .select("team_id")
    .eq("player_id", playerId);

  return (data ?? []).map((row) => row.team_id as string);
}

export async function getPlayerRsvpStatus(
  supabase: SupabaseClient,
  eventId: string,
  playerId: string
): Promise<string> {
  const { data } = await supabase
    .from("rsvps")
    .select("status")
    .eq("event_id", eventId)
    .eq("player_id", playerId)
    .maybeSingle();

  return data?.status ?? "PENDING";
}

export async function getTeamRoster(
  supabase: SupabaseClient,
  teamId: string
): Promise<RosterPlayer[]> {
  const { data } = await supabase
    .from("team_players")
    .select("players(id, first_name, last_name)")
    .eq("team_id", teamId);

  const roster = (data ?? [])
    .map((row) => row.players as unknown as RosterPlayer | null)
    .filter((p): p is RosterPlayer => Boolean(p));
  // Trié une bonne fois ici : tous les écrans qui affichent un effectif
  // d'équipe (Organisation, cartes de match, badges de présence...) lisent
  // ce même helper, donc trier à la source évite de le refaire (ou de
  // l'oublier) dans chacun d'eux.
  return sortByLastName(roster, (p) => p.last_name);
}

export async function getRsvpCounts(
  supabase: SupabaseClient,
  eventId: string,
  rosterSize: number
): Promise<RsvpCounts> {
  const { data } = await supabase
    .from("rsvps")
    .select("status")
    .eq("event_id", eventId);

  const counts: RsvpCounts = { present: 0, pending: 0, absent: 0, late: 0 };
  (data ?? []).forEach((row) => {
    if (row.status === "PRESENT") counts.present += 1;
    else if (row.status === "ABSENT") counts.absent += 1;
    else if (row.status === "LATE") counts.late += 1;
    else counts.pending += 1;
  });

  const answered = data?.length ?? 0;
  counts.pending += Math.max(0, rosterSize - answered);

  return counts;
}
