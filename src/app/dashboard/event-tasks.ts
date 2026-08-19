import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPersonName } from "@/lib/names";

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

export type CarpoolReservation = {
  playerId: string;
  playerName: string;
  seats: number;
};

export type CarpoolOffer = {
  id: string;
  playerId: string;
  playerName: string;
  seats: number;
  departureTime: string | null;
  meetingPoint: string | null;
  reservations: CarpoolReservation[];
};

// playerId -> code du rôle -> nombre de fois assuré sur la saison.
export type SeasonTaskTally = Record<string, Record<string, number>>;

function fullName(p: { first_name: string | null; last_name: string | null }) {
  return formatPersonName(p.first_name, p.last_name);
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
    .select("event_id, task_type, player_id, source")
    .in("event_id", eventIds);

  // Requête séparée vers teammate_names plutôt qu'une jointure players(...)
  // directe : la fiche players complète d'un coéquipier n'est pas visible
  // pour un simple joueur (vie privée — téléphone, adresse, notes
  // médicales), la jointure revenait donc vide et affichait "Non attribué"
  // même quand le rôle était déjà pris (retour de Cindy du 2026-08-20).
  // teammate_names n'expose que prénom/nom, à qui a le droit de les voir.
  const playerIds = [...new Set((data ?? []).map((row) => row.player_id as string))];
  const nameByPlayerId = new Map<string, string>();
  if (playerIds.length > 0) {
    const { data: nameRows } = await supabase
      .from("teammate_names")
      .select("id, first_name, last_name")
      .in("id", playerIds);
    (nameRows ?? []).forEach((row) => {
      nameByPlayerId.set(row.id as string, fullName(row));
    });
  }

  (data ?? []).forEach((row) => {
    const eventId = row.event_id as string;
    const state = (result[eventId] ??= {});
    const playerId = row.player_id as string;
    const playerName = nameByPlayerId.get(playerId);
    state[row.task_type as string] = playerName
      ? {
          playerId,
          playerName,
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

  const { data: offerRows } = await supabase
    .from("event_carpool_offers")
    .select("id, event_id, player_id, seats, departure_time, meeting_point")
    .in("event_id", eventIds)
    .gt("seats", 0);

  const offerIds = (offerRows ?? []).map((row) => row.id as string);

  // Requête séparée plutôt qu'une jointure imbriquée à deux niveaux
  // (offres -> réservations -> fiches) : plus simple à relire, et cohérent
  // avec le reste du fichier (team_players -> players fait déjà pareil).
  const reservationsByOfferId = new Map<string, CarpoolReservation[]>();
  const reservationRowsResult = offerIds.length > 0
    ? await supabase
        .from("event_carpool_reservations")
        .select("offer_id, player_id, seats")
        .in("offer_id", offerIds)
    : { data: null };
  const reservationRows = reservationRowsResult.data;

  // Noms résolus via teammate_names plutôt qu'une jointure players(...)
  // directe : un coéquipier n'a pas accès à la fiche complète d'un autre
  // (vie privée), la jointure revenait vide et affichait "Famille" à la
  // place du vrai nom (retour de Cindy du 2026-08-20).
  const carpoolPlayerIds = [
    ...new Set([
      ...(offerRows ?? []).map((row) => row.player_id as string),
      ...(reservationRows ?? []).map((row) => row.player_id as string),
    ]),
  ];
  const nameByPlayerId = new Map<string, string>();
  if (carpoolPlayerIds.length > 0) {
    const { data: nameRows } = await supabase
      .from("teammate_names")
      .select("id, first_name, last_name")
      .in("id", carpoolPlayerIds);
    (nameRows ?? []).forEach((row) => {
      nameByPlayerId.set(row.id as string, fullName(row));
    });
  }

  (reservationRows ?? []).forEach((row) => {
    const offerId = row.offer_id as string;
    const list = reservationsByOfferId.get(offerId) ?? [];
    list.push({
      playerId: row.player_id as string,
      playerName: nameByPlayerId.get(row.player_id as string) ?? "Famille",
      seats: row.seats as number,
    });
    reservationsByOfferId.set(offerId, list);
  });

  (offerRows ?? []).forEach((row) => {
    const eventId = row.event_id as string;
    const offerId = row.id as string;
    const list = (result[eventId] ??= []);
    list.push({
      id: offerId,
      playerId: row.player_id as string,
      playerName: nameByPlayerId.get(row.player_id as string) ?? "Famille",
      seats: row.seats as number,
      departureTime: (row.departure_time as string | null) ?? null,
      meetingPoint: (row.meeting_point as string | null) ?? null,
      reservations: reservationsByOfferId.get(offerId) ?? [],
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

  function addToTally(teamId: string, playerId: string, code: string) {
    const tally = (result[teamId] ??= {});
    const byRole = (tally[playerId] ??= {});
    byRole[code] = (byRole[code] ?? 0) + 1;
  }

  const [{ data: teamScoped }, { data: clubWide }, { data: rosterRows }] = await Promise.all([
    supabase
      .from("event_tasks")
      .select("task_type, player_id, events!inner(team_id)")
      .in("events.team_id", teamIds),
    // Un rôle pris sur un événement club (events.team_id null) n'est
    // rattaché à aucune équipe par l'événement lui-même — seulement par
    // l'équipe du joueur qui l'a pris. "Prochains événements" l'affiche
    // déjà (pas filtré par équipe), mais le Bilan de saison, lui, l'a
    // toujours ignoré : les deux écrans se contredisaient pour le même
    // rôle sur le même événement.
    supabase
      .from("event_tasks")
      .select("task_type, player_id, events!inner(team_id)")
      .is("events.team_id", null),
    supabase.from("team_players").select("team_id, player_id").in("team_id", teamIds),
  ]);

  (teamScoped ?? []).forEach((row) => {
    const event = row.events as unknown as { team_id: string } | null;
    if (!event) return;
    addToTally(event.team_id, row.player_id as string, row.task_type as string);
  });

  const teamIdsByPlayerId = new Map<string, string[]>();
  (rosterRows ?? []).forEach((r) => {
    const list = teamIdsByPlayerId.get(r.player_id) ?? [];
    list.push(r.team_id);
    teamIdsByPlayerId.set(r.player_id, list);
  });

  (clubWide ?? []).forEach((row) => {
    const playerId = row.player_id as string;
    const code = row.task_type as string;
    (teamIdsByPlayerId.get(playerId) ?? []).forEach((teamId) => addToTally(teamId, playerId, code));
  });

  return result;
}
