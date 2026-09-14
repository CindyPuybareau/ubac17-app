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
  nextEvent: SpaceDashboardNextEvent | null;
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
      nextEvent: null,
      seasonLabel,
    };
  }

  const { startIso, endIso } = getCurrentSeasonWindow();
  const singleTeamId = teamIds && teamIds.length === 1 ? teamIds[0] : null;

  const [rosterRes, teamCountRes, photoRes, matchesRes, nextEventRes] = await Promise.all([
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
    // Prochain événement : borné à cette ou ces équipes précises côté
    // Coach/Famille (le prochain rendez-vous qui LES concerne), jamais
    // filtré côté Bureau (le prochain du club entier, toutes équipes
    // confondues). is_home/event_type/team_id/target_team_ids en plus
    // (retour de Cindy du 13/09) : nécessaires à la carte complète
    // (DayEventCard) et au calcul "qui est concerné" ci-dessous.
    (() => {
      let q = supabase
        .from("events")
        .select(
          "id, title, event_type, start_time, location, salle, is_home, team_id, target_team_ids, teams(name)"
        )
        .gte("start_time", new Date().toISOString())
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

  const nextRow = (nextEventRes.data ?? [])[0] as unknown as
    | {
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
      }
    | undefined;

  let nextEvent: SpaceDashboardNextEvent | null = null;
  if (nextRow) {
    // Réutilise telle quelle la même fonction que le reste de l'appli
    // (VolunteerNeedsPanel, calendar-view.tsx...) -- jamais une requête
    // event_volunteer_needs/signups dupliquée ici.
    const needsByEventId = await getVolunteerNeedsByEventId(supabase, [nextRow.id]);
    const rsvpPlayers: NextEventRsvpPlayer[] = rsvpCandidates
      .filter((p) => isConcernedByEvent(p, nextRow))
      .map((p) => ({ id: p.id, name: p.name, status: "PENDING" }));

    // Statut réel plutôt que "PENDING" partout (retour de Cindy du 13/09,
    // "pour les parents pouvoir y répondre ici" -- le bouton doit refléter
    // une réponse déjà donnée, pas repartir à zéro) : une seule petite
    // requête, seulement quand il y a vraiment quelqu'un à interroger.
    if (rsvpPlayers.length > 0) {
      const { data: rsvpRows } = await supabase
        .from("rsvps")
        .select("player_id, status")
        .eq("event_id", nextRow.id)
        .in(
          "player_id",
          rsvpPlayers.map((p) => p.id)
        );
      const statusByPlayerId = new Map(
        ((rsvpRows ?? []) as { player_id: string; status: string }[]).map((r) => [r.player_id, r.status])
      );
      rsvpPlayers.forEach((p) => {
        p.status = statusByPlayerId.get(p.id) ?? "PENDING";
      });
    }

    nextEvent = {
      id: nextRow.id,
      title: nextRow.title,
      eventType: nextRow.event_type,
      startTime: nextRow.start_time,
      location: nextRow.location,
      salle: nextRow.salle,
      isHome: nextRow.is_home,
      teamName: nextRow.teams?.name ?? null,
      source,
      rsvpPlayers,
      needs: needsByEventId[nextRow.id] ?? [],
    };
  }

  return {
    photoUrl: (photoRes.data as { photo_url: string | null } | null)?.photo_url ?? null,
    singleTeamId,
    playerCount,
    teamCount: teamIds === null ? (teamCountRes as { count: number | null }).count ?? 0 : null,
    official,
    friendly,
    nextEvent,
    seasonLabel,
  };
}
