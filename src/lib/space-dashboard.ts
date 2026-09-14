import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentSeasonLabel, getCurrentSeasonWindow } from "./season";
import { getVolunteerNeedsByEventId, type VolunteerNeed } from "@/app/dashboard/event-volunteer-needs";

// "Tableau de bord" (retour de Cindy du 13/09, "ce que tu mettrais dans le
// tableau de bord... photo d'équipe, nombre de joueurs, matchs officiels/
// amicaux joués, points marqués, saison en cours, prochain événement") :
// un résumé qui reflète l'ESPACE où on est déjà, jamais un sélecteur manuel
// (retour de Cindy, "je souhaiterais voir ce qui concerne l'espace en
// lui-même") -- teamIds décide ce périmètre :
// - null  -> Bureau/commission : club entier, aucune équipe en particulier.
// - [...] -> Coach/Famille : la ou les équipes concernées (coachées, ou
//   celles de tous les enfants/du joueur), cumulées si plusieurs.
// Une seule fonction pour les deux cas plutôt que deux blocs de requêtes
// dupliqués -- le "cumul si plusieurs équipes" tombe naturellement en
// sommant sur teamIds, sans branche séparée à maintenir.
//
// Retour de Cindy du 13/09 ("la carte prochain événement ne doit pas être
// en lecture seule... vue carte complète, même design") : nextEvent porte
// désormais tout ce qu'il faut pour afficher la même carte interactive que
// week-strip-banner.tsx (DayEventCard) -- besoins d'organisation
// (event_volunteer_needs, réutilise getVolunteerNeedsByEventId telle
// quelle) et, pour la Famille uniquement, qui répond pour qui (rsvpPlayers,
// voir rsvpCandidates plus bas). Bureau/Coach n'ont jamais de rsvpPlayers
// (aucune fiche joueur propre à répondre présent/absent pour son propre
// événement).
export type NextEventSource = "bureau" | "coach" | "family";

export type NextEventRsvpPlayer = { id: string; name: string; status: string };

export type SpaceDashboardNextEvent = {
  id: string;
  title: string | null;
  eventType: string | null;
  startTime: string;
  location: string | null;
  salle: string | null;
  isHome: boolean | null;
  teamName: string | null;
  source: NextEventSource;
  rsvpPlayers: NextEventRsvpPlayer[];
  needs: VolunteerNeed[];
};

export type SpaceDashboardSummary = {
  // Non-null seulement quand teamIds contient EXACTEMENT une équipe : une
  // photo unique n'a de sens que pour une seule équipe à la fois (voir son
  // commentaire dans space-dashboard-summary.tsx pour le repli visuel).
  photoUrl: string | null;
  // Id de cette équipe unique, pour le bouton d'envoi de photo (Bureau/
  // coach de CETTE équipe seulement, voir la policy du bucket
  // team-photos). Null dans tous les autres cas (club entier, plusieurs
  // équipes) -- pas de bouton d'envoi alors, une photo n'a pas de
  // destination unique où se ranger.
  singleTeamId: string | null;
  playerCount: number;
  // Non-null seulement pour le club entier (teamIds === null) : le nombre
  // d'équipes n'a pas de sens une fois qu'on est déjà dans une équipe
  // précise.
  teamCount: number | null;
  official: { played: number; points: number };
  friendly: { played: number; points: number };
  // Retour de Cindy du 14/09 ("le bureau n'a pas qu'un seul entraînement de
  // prévu cette semaine... si plusieurs événements dans la journée, pouvoir
  // les visualiser") : TOUS les événements du jour le plus proche (pas
  // juste le tout premier) -- un tableau plutôt qu'un événement unique,
  // vide si rien à venir.
  nextEvents: SpaceDashboardNextEvent[];
  seasonLabel: string;
};

const EMPTY_MATCH_STATS = { played: 0, points: 0 };

// Retour de Cindy du 13/09 : même bug/même correctif que respondingPlayers
// (calendar-view.tsx) -- teamId ET target_team_ids tous deux vides encode
// "Tous les groupes", pas "personne n'est concerné".
function isConcernedByEvent(
  p: { teamIds: string[] },
  event: { team_id: string | null; target_team_ids: string[] | null }
) {
  const isClubWideEvent = !event.team_id && (!event.target_team_ids || event.target_team_ids.length === 0);
  return (
    isClubWideEvent ||
    (event.team_id !== null && p.teamIds.includes(event.team_id)) ||
    (event.target_team_ids?.some((id) => p.teamIds.includes(id)) ?? false)
  );
}

export async function getSpaceDashboardSummary(
  supabase: SupabaseClient,
  teamIds: string[] | null,
  source: NextEventSource,
  // Retour de Cindy du 13/09 ("pour les parents pouvoir y répondre ici") :
  // uniquement fourni côté Famille -- l'ensemble des joueurs (self ou
  // enfants) dont on doit vérifier s'ils sont concernés par le prochain
  // événement, et donc leur faire porter un bouton Présent/Absent. Jamais
  // fourni côté Bureau/Coach (rsvpPlayers restera toujours vide pour eux,
  // ce qui est le comportement voulu -- même règle que DayEventCard).
  rsvpCandidates: { id: string; name: string; teamIds: string[] }[] = []
): Promise<SpaceDashboardSummary> {
  const seasonLabel = getCurrentSeasonLabel();

  // Retour de Cindy du 06/09 (Sandrine Manzelle) et principe déjà établi
  // ailleurs dans ce fichier : un compte cumulant plusieurs casquettes peut
  // très bien n'avoir, ponctuellement, aucune équipe concernée (ex. un
  // coach entre deux saisons, sans équipe encore affectée) -- court-circuit
  // plutôt que des requêtes filtrées sur un tableau vide (qui renverraient
  // silencieusement zéro ligne de toute façon, mais sans jamais l'exprimer
  // clairement).
  if (teamIds !== null && teamIds.length === 0) {
    return {
      photoUrl: null,
      singleTeamId: null,
      playerCount: 0,
      teamCount: null,
      official: { ...EMPTY_MATCH_STATS },
      friendly: { ...EMPTY_MATCH_STATS },
      nextEvents: [],
      seasonLabel,
    };
  }

  const { startIso, endIso } = getCurrentSeasonWindow();
  const singleTeamId = teamIds && teamIds.length === 1 ? teamIds[0] : null;

  const nowIso = new Date().toISOString();
  const [rosterRes, teamCountRes, photoRes, matchesRes, firstUpcomingRes] = await Promise.all([
    teamIds === null
      ? supabase.from("players").select("id", { count: "exact", head: true }).is("archived_at", null)
      : supabase.from("team_players").select("player_id").in("team_id", teamIds),
    teamIds === null
      ? supabase.from("teams").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: null, data: null, error: null }),
    singleTeamId
      ? supabase.from("teams").select("photo_url").eq("id", singleTeamId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Matchs (officiels = MATCH, amicaux = FRIENDLY) de la saison en cours,
    // avec un score déjà enregistré -- un match programmé mais pas encore
    // joué (ou dont le score a été oublié) ne doit compter ni dans "joués"
    // ni dans les points. Un tournoi (TOURNAMENT) n'a pas de score unique
    // opposant deux équipes au sens propre -- volontairement hors de ces
    // deux compteurs.
    (() => {
      let q = supabase
        .from("events")
        .select("event_type, team_score")
        .in("event_type", ["MATCH", "FRIENDLY"])
        .gte("start_time", startIso)
        .lt("start_time", endIso)
        .not("team_score", "is", null);
      if (teamIds !== null) q = q.in("team_id", teamIds);
      return q;
    })(),
    // Retour de Cindy du 14/09 ("plusieurs événements dans la journée,
    // pouvoir les visualiser") : première étape en deux temps -- juste la
    // date du tout premier événement à venir, pour ensuite borner la
    // vraie requête (plus bas) à CETTE journée entière plutôt qu'à une
    // seule ligne.
    (() => {
      let q = supabase
        .from("events")
        .select("start_time")
        .gte("start_time", nowIso)
        .order("start_time", { ascending: true })
        .limit(1);
      if (teamIds !== null) q = q.in("team_id", teamIds);
      return q;
    })(),
  ]);

  const playerCount =
    teamIds === null
      ? (rosterRes as { count: number | null }).count ?? 0
      : new Set(
          ((rosterRes as { data: { player_id: string }[] | null }).data ?? []).map((r) => r.player_id)
        ).size;

  const official = { ...EMPTY_MATCH_STATS };
  const friendly = { ...EMPTY_MATCH_STATS };
  ((matchesRes.data ?? []) as { event_type: string; team_score: number | null }[]).forEach((m) => {
    const bucket = m.event_type === "MATCH" ? official : friendly;
    bucket.played += 1;
    bucket.points += m.team_score ?? 0;
  });

  const firstUpcomingStart = (firstUpcomingRes.data ?? [])[0]?.start_time as string | undefined;

  type EventRow = {
    id: string;
    title: string | null;
    event_type: string | null;
    start_time: string;
    location: string | null;
    salle: string | null;
    is_home: boolean | null;
    team_id: string | null;
    target_team_ids: string[] | null;
    teams: { name: string | null } | null;
  };

  let dayRows: EventRow[] = [];
  if (firstUpcomingStart) {
    // Bornes du jour du tout premier événement à venir, en heure de Paris
    // -- même idiome que /api/cron/match-reminders (jamais le fuseau du
    // runtime, UTC sur Vercel, qui ferait glisser la frontière du jour).
    const parisRef = new Date(new Date(firstUpcomingStart).toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    const dayEnd = new Date(
      parisRef.getFullYear(),
      parisRef.getMonth(),
      parisRef.getDate() + 1
    ).toISOString();

    // nowIso comme seule borne basse (pas le début du jour) : exclut un
    // entraînement du matin déjà passé sans exclure ceux encore à venir
    // plus tard cette même journée.
    let dayQuery = supabase
      .from("events")
      .select(
        "id, title, event_type, start_time, location, salle, is_home, team_id, target_team_ids, teams(name)"
      )
      .gte("start_time", nowIso)
      .lt("start_time", dayEnd)
      .order("start_time", { ascending: true });
    if (teamIds !== null) dayQuery = dayQuery.in("team_id", teamIds);
    const { data } = await dayQuery;
    dayRows = (data ?? []) as unknown as EventRow[];
  }

  let nextEvents: SpaceDashboardNextEvent[] = [];
  if (dayRows.length > 0) {
    const eventIds = dayRows.map((r) => r.id);
    // Réutilise telle quelle la même fonction que le reste de l'appli
    // (VolunteerNeedsPanel, calendar-view.tsx...) -- jamais une requête
    // event_volunteer_needs/signups dupliquée ici. Un seul appel pour
    // TOUS les événements du jour plutôt qu'un par carte.
    const needsByEventId = await getVolunteerNeedsByEventId(supabase, eventIds);

    // Une seule requête rsvps pour tous les événements du jour à la fois
    // (retour de Cindy du 13/09, "pour les parents pouvoir y répondre
    // ici" -- le bouton doit refléter une réponse déjà donnée), plutôt
    // qu'une par carte.
    const candidateIds = rsvpCandidates.map((p) => p.id);
    const statusByEventAndPlayer = new Map<string, string>();
    if (candidateIds.length > 0) {
      const { data: rsvpRows } = await supabase
        .from("rsvps")
        .select("event_id, player_id, status")
        .in("event_id", eventIds)
        .in("player_id", candidateIds);
      ((rsvpRows ?? []) as { event_id: string; player_id: string; status: string }[]).forEach((r) => {
        statusByEventAndPlayer.set(`${r.event_id}:${r.player_id}`, r.status);
      });
    }

    nextEvents = dayRows.map((row) => ({
      id: row.id,
      title: row.title,
      eventType: row.event_type,
      startTime: row.start_time,
      location: row.location,
      salle: row.salle,
      isHome: row.is_home,
      teamName: row.teams?.name ?? null,
      source,
      rsvpPlayers: rsvpCandidates
        .filter((p) => isConcernedByEvent(p, row))
        .map((p) => ({
          id: p.id,
          name: p.name,
          status: statusByEventAndPlayer.get(`${row.id}:${p.id}`) ?? "PENDING",
        })),
      needs: needsByEventId[row.id] ?? [],
    }));
  }

  return {
    photoUrl: (photoRes.data as { photo_url: string | null } | null)?.photo_url ?? null,
    singleTeamId,
    playerCount,
    teamCount: teamIds === null ? (teamCountRes as { count: number | null }).count ?? 0 : null,
    official,
    friendly,
    nextEvents,
    seasonLabel,
  };
}
