import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkedQuery, type Semaphore } from "@/lib/batch";
import { REFEREE_CONFIRMED_LABEL } from "./match-official-roles";
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
// bilan -- jamais l'entraînement (compté à part, voir attendanceByPlayerId
// plus bas) ni la réunion/l'événement club générique classé ailleurs.
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
// (même source que l'assiduité de l'ancien BilanTeamTable). Retour de Cindy
// du 24/09 ("le nombre d'entraînement devrait être le même pour tout le
// monde") : la table `rsvps` ne stocke jamais "PENDING" (vérifié en base --
// seuls PRESENT/ABSENT existent), donc rien ne distingue "jamais répondu"
// de "pas concerné par cet entraînement" via le statut seul -- compter le
// total à partir des seules réponses données produisait un dénominateur
// différent par joueur (celui qui répond toujours vs. celui qui ne répond
// jamais), pourtant les mêmes entraînements ont eu lieu pour toute
// l'équipe. Le total est maintenant celui des entraînements PASSÉS DE
// L'ÉQUIPE (teamId, même filtre que l'ancien BilanTeamTable), identique
// pour tout le roster ; un joueur qui n'a jamais répondu y apparaît
// toujours, juste sans "présent" compté. getStatus reste un accesseur (pas
// un Record déjà à plat) pour accepter aussi bien coachRsvpStatusByKey
// (Record) que la Map imbriquée du Bureau (rsvpsByEvent) sans jamais
// reformater l'un en l'autre.
export function computeSeasonParticipation(
  events: Pick<AdminUpcomingEvent, "id" | "event_type" | "start_time" | "teamId" | "targetTeamIds">[],
  getStatus: (eventId: string, playerId: string) => string | null | undefined,
  playerIds: string[],
  teamId: string
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
  const pastEvents = events.filter(
    (e) =>
      new Date(e.start_time).getTime() < nowMs &&
      (e.teamId === teamId || (e.targetTeamIds?.includes(teamId) ?? false))
  );
  const bucketByType = PARTICIPATION_TYPES;

  pastEvents.forEach((e) => {
    const isTraining = e.event_type === "TRAINING";
    const bucket = bucketByType[e.event_type ?? ""];
    if (!isTraining && !bucket) return;
    playerIds.forEach((playerId) => {
      const status = getStatus(e.id, playerId);
      const present = status === "PRESENT" || status === "LATE";
      if (isTraining) {
        // Même dénominateur pour tout le roster : chaque entraînement passé
        // de l'équipe compte, réponse donnée ou non.
        const attendance = attendanceByPlayerId[playerId];
        attendance.total += 1;
        if (present) attendance.present += 1;
      } else if (present && bucket) {
        participationByPlayerId[playerId][bucket] += 1;
      }
    });
  });

  return { attendanceByPlayerId, participationByPlayerId };
}

// Bilan bénévoles de la saison : besoins classiques (event_volunteer_
// signups -- Goûter/Buvette/Installation/Lavage maillots/Autre, un compteur
// PAR CODE, jamais regroupés -- retour de Cindy du 24/09, "ils doivent être
// tous visible pas regroupé ensemble"), rôles officiels (match_official_
// roles -- Arbitre 1/2, E-marque, Aide marqueur, Chronométreur, Délégués,
// idem un par code) et covoiturage proposé (event_carpool_offers), comptés
// sur les eventIds donnés. Même principe que getEventTasksByEventId/
// getCarpoolOffersByEventId (event-tasks.ts) : un .in("event_id", chunk)
// par tranche de 150 événements, JAMAIS une requête par joueur -- et
// surtout jamais de filtre par joueur non plus (playerIds peut valoir tout
// le club côté Bureau, potentiellement aussi grand que eventIds) : on
// récupère toutes les lignes des événements concernés, agrégées en mémoire
// une fois reçues, puis l'appelant ne garde que les joueurs qui
// l'intéressent (déjà en mémoire, sans requête de plus).
export type SeasonVolunteerTally = {
  // Un compteur par code de rôle classique (GOUTER_ENCAS, BUVETTE,
  // INSTALLATION, LAVAGE_MAILLOTS, AUTRE -- CUSTOM_ROLE_CODE), clé absente =
  // jamais fait.
  byRoleCode: Record<string, number>;
  // Idem pour les rôles officiels (ARBITRE_1, ARBITRE_2, EMARQUE,
  // AIDE_MARQUEUR, CHRONOMETREUR, DELEGUE_CLUB, DELEGUE_FAIRPLAY).
  byOfficialCode: Record<string, number>;
  covoiturage: number;
};

// Un bénévole qui écrit son propre nom (ou que le Bureau/Coach saisit sans
// choisir un membre du club, guest_name) n'a pas de player_id -- retour de
// Cindy du 24/09 ("Greg Martin a voté pour le goûter... il n'apparaît
// pas ?") : ces inscriptions étaient jusqu'ici silencieusement ignorées
// (bump() les sautait faute de player_id). Elles doivent "faire partie du
// tableau bénévoles" (retour de Cindy) -- portées ici séparément (pas de
// ligne de roster où les rattacher), à l'appelant de les agréger par nom et
// de les rattacher à la bonne équipe via l'event_id (déjà en mémoire, comme
// pour l'assiduité entraînements ci-dessus).
export type SeasonGuestVolunteer = {
  name: string;
  eventId: string;
  category: "classique" | "officiel";
  code: string;
};

function emptyVolunteerTally(): SeasonVolunteerTally {
  return { byRoleCode: {}, byOfficialCode: {}, covoiturage: 0 };
}

export async function getSeasonVolunteerTallyByEventIds(
  supabase: SupabaseClient,
  eventIds: string[],
  dbLimit?: Semaphore
): Promise<{
  tallyByPlayerId: Record<string, SeasonVolunteerTally>;
  guestEntries: SeasonGuestVolunteer[];
}> {
  const tallyByPlayerId: Record<string, SeasonVolunteerTally> = {};
  const guestEntries: SeasonGuestVolunteer[] = [];
  if (eventIds.length === 0) return { tallyByPlayerId, guestEntries };

  function ensure(playerId: string): SeasonVolunteerTally {
    return (tallyByPlayerId[playerId] ??= emptyVolunteerTally());
  }

  const [signups, officials, carpools] = await Promise.all([
    chunkedQuery(
      eventIds,
      150,
      (chunk) =>
        supabase
          .from("event_volunteer_signups")
          .select("player_id, guest_name, event_volunteer_needs!inner(event_id, role_code)")
          .in("event_volunteer_needs.event_id", chunk),
      dbLimit ?? 4
    ),
    chunkedQuery(
      eventIds,
      150,
      (chunk) =>
        supabase
          .from("match_official_roles")
          .select("player_id, guest_name, role_code, event_id")
          .in("event_id", chunk),
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

  signups.data.forEach((row) => {
    const need = row.event_volunteer_needs as unknown as { event_id: string; role_code: string } | null;
    if (!need) return;
    const playerId = row.player_id as string | null;
    const guestName = row.guest_name as string | null;
    if (playerId) {
      const tally = ensure(playerId);
      tally.byRoleCode[need.role_code] = (tally.byRoleCode[need.role_code] ?? 0) + 1;
    } else if (guestName) {
      guestEntries.push({ name: guestName, eventId: need.event_id, category: "classique", code: need.role_code });
    }
  });

  officials.data.forEach((row) => {
    const playerId = row.player_id as string | null;
    const guestName = row.guest_name as string | null;
    const roleCode = row.role_code as string;
    // "Arbitre officiel" (retour de Cindy du 18/09) : confirmation en un
    // clic que la ligue a désigné l'arbitre, jamais une vraie personne --
    // ni compté dans un tally, ni affiché comme "invité" dans le bilan.
    if (guestName === REFEREE_CONFIRMED_LABEL) return;
    if (playerId) {
      const tally = ensure(playerId);
      tally.byOfficialCode[roleCode] = (tally.byOfficialCode[roleCode] ?? 0) + 1;
    } else if (guestName) {
      guestEntries.push({ name: guestName, eventId: row.event_id as string, category: "officiel", code: roleCode });
    }
  });

  carpools.data.forEach((row) => {
    const playerId = row.player_id as string | null;
    // Le covoiturage est toujours proposé depuis le compte d'une famille
    // (player_id) -- pas de mode "invité" pour ce système, rien à ajouter à
    // guestEntries ici.
    if (playerId) ensure(playerId).covoiturage += 1;
  });

  return { tallyByPlayerId, guestEntries };
}
