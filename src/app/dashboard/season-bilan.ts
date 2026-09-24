import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkedQuery, type Semaphore } from "@/lib/batch";
import type { AdminUpcomingEvent } from "./page";

// Refonte "Organisation & Bilan" (retour de Cindy du 24/09) : "Planning &
// Rôles" et l'ancien "Bilan de la saison" reposaient sur le catalogue de
// rôles Maillots/Table de marque (event_role_types/event_tasks), archivé
// depuis le passage aux nouveaux systèmes -- les deux onglets tournaient
// dans le vide (0 rôle actif en base). Ce fichier porte les deux nouveaux
// volets : la participation aux événements (matchs officiels/amicaux/
// tournois/autres) et le bénévolat (besoins classiques, rôles officiels,
// covoiturage proposé), calculés depuis les tables réellement vivantes.

// Types d'événement qui comptent comme "participation" au sens de ce
// bilan -- jamais l'entraînement (déjà couvert par l'assiduité globale,
// une colonne à part) ni la réunion/l'événement club générique classé
// ailleurs.
const PARTICIPATION_TYPES: Record<string, keyof SeasonParticipationTally> = {
  MATCH: "official",
  FRIENDLY: "friendly",
  TOURNAMENT: "tournament",
  OTHER: "other",
};

export type SeasonParticipationTally = {
  official: number;
  friendly: number;
  tournament: number;
  other: number;
};

export type SeasonAttendance = { present: number; total: number };

function emptyParticipationTally(): SeasonParticipationTally {
  return { official: 0, friendly: 0, tournament: 0, other: 0 };
}

// Pure, sans requête : events/getStatus sont déjà chargés par l'appelant
// pour l'assiduité existante (voir l'ancien BilanTeamTable) -- une seule
// passe sur les événements passés calcule à la fois l'assiduité globale
// (toujours affichée) ET sa répartition par type de rencontre (retour de
// Cindy du 24/09 -- l'ancien tableau ne comptait que des rôles Maillots/
// Table de marque, un catalogue archivé depuis longtemps). getStatus reste
// un accesseur (pas un Record déjà à plat) pour accepter aussi bien
// coachRsvpStatusByKey (Record) que la Map imbriquée du Bureau
// (rsvpsByEvent) sans jamais reformater l'un en l'autre.
export function computeSeasonParticipation(
  events: Pick<AdminUpcomingEvent, "id" | "event_type" | "start_time">[],
  getStatus: (eventId: string, playerId: string) => string | null | undefined,
  playerIds: string[]
): {
  attendanceByPlayerId: Record<string, SeasonAttendance>;
  participationByPlayerId: Record<string, SeasonParticipationTally>;
} {
  const attendanceByPlayerId: Record<string, SeasonAttendance> = {};
  const participationByPlayerId: Record<string, SeasonParticipationTally> = {};
  playerIds.forEach((id) => {
    attendanceByPlayerId[id] = { present: 0, total: 0 };
    participationByPlayerId[id] = emptyParticipationTally();
  });
  if (playerIds.length === 0) return { attendanceByPlayerId, participationByPlayerId };

  const nowMs = Date.now();
  const pastEvents = events.filter((e) => new Date(e.start_time).getTime() < nowMs);
  const bucketByType = PARTICIPATION_TYPES;

  pastEvents.forEach((e) => {
    const bucket = bucketByType[e.event_type ?? ""];
    playerIds.forEach((playerId) => {
      const status = getStatus(e.id, playerId);
      if (!status || status === "PENDING") return;
      const attendance = attendanceByPlayerId[playerId];
      attendance.total += 1;
      const present = status === "PRESENT" || status === "LATE";
      if (present) attendance.present += 1;
      if (present && bucket) participationByPlayerId[playerId][bucket] += 1;
    });
  });

  return { attendanceByPlayerId, participationByPlayerId };
}

// Bilan bénévoles de la saison : besoins classiques (event_volunteer_
// signups -- Buvette/Goûter/Lavage maillots/Autre), rôles officiels
// (match_official_roles -- E-marque/Arbitres/Chronométreur/Délégués) et
// covoiturage proposé (event_carpool_offers), comptés par joueur sur les
// eventIds donnés. Même principe que getEventTasksByEventId/
// getCarpoolOffersByEventId (event-tasks.ts) : un .in("event_id", chunk)
// par tranche de 150 événements, JAMAIS une requête par joueur -- et
// surtout jamais de filtre par joueur non plus (playerIds peut valoir tout
// le club côté Bureau, potentiellement aussi grand que eventIds) : on
// récupère toutes les lignes des événements concernés, agrégées par
// player_id en mémoire une fois reçues, puis l'appelant ne garde que les
// joueurs qui l'intéressent (déjà en mémoire, sans requête de plus).
export type SeasonVolunteerTally = {
  classique: number;
  officiel: number;
  covoiturage: number;
};

function emptyVolunteerTally(): SeasonVolunteerTally {
  return { classique: 0, officiel: 0, covoiturage: 0 };
}

export async function getSeasonVolunteerTallyByEventIds(
  supabase: SupabaseClient,
  eventIds: string[],
  dbLimit?: Semaphore
): Promise<Record<string, SeasonVolunteerTally>> {
  const result: Record<string, SeasonVolunteerTally> = {};
  if (eventIds.length === 0) return result;

  function bump(playerId: string | null | undefined, key: keyof SeasonVolunteerTally) {
    if (!playerId) return;
    const tally = (result[playerId] ??= emptyVolunteerTally());
    tally[key] += 1;
  }

  const [signups, officials, carpools] = await Promise.all([
    chunkedQuery(
      eventIds,
      150,
      (chunk) =>
        supabase
          .from("event_volunteer_signups")
          .select("player_id, event_volunteer_needs!inner(event_id)")
          .in("event_volunteer_needs.event_id", chunk),
      dbLimit ?? 4
    ),
    chunkedQuery(
      eventIds,
      150,
      (chunk) =>
        supabase.from("match_official_roles").select("player_id, event_id").in("event_id", chunk),
      dbLimit ?? 4
    ),
    chunkedQuery(
      eventIds,
      150,
      (chunk) =>
        supabase
          .from("event_carpool_offers")
          .select("player_id, event_id")
          .in("event_id", chunk)
          .gt("seats", 0),
      dbLimit ?? 4
    ),
  ]);

  [
    ["signups", signups.errors],
    ["officials", officials.errors],
    ["carpools", carpools.errors],
  ].forEach(([label, errors]) =>
    (errors as unknown[]).forEach((error) =>
      console.error(`[getSeasonVolunteerTallyByEventIds] tranche échouée (${label}):`, error)
    )
  );

  signups.data.forEach((row) => bump(row.player_id as string | null, "classique"));
  officials.data.forEach((row) => bump(row.player_id as string | null, "officiel"));
  carpools.data.forEach((row) => bump(row.player_id as string | null, "covoiturage"));

  return result;
}
