import type { SupabaseClient } from "@supabase/supabase-js";
import { getCurrentSeasonLabel, getCurrentSeasonWindow } from "./season";
import { getVolunteerNeedsByEventId, type VolunteerNeed } from "@/app/dashboard/event-volunteer-needs";
import { getMatchOfficialRolesByEventId, type MatchOfficialAssignment } from "@/app/dashboard/match-official-roles";
import { runBatched, Semaphore } from "./batch";

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
  // Ajoutés le 14/09 (retour de Cindy, "les cartes du tableau de bord ne
  // ressemblent pas à celles du calendrier") : même parité d'info que
  // WeekStripEvent (week-strip-banner.tsx), la carte étant partagée.
  endTime: string | null;
  impactTime: string | null;
  notes: string | null;
  isPaid: boolean;
  paymentLink: string | null;
  location: string | null;
  salle: string | null;
  isHome: boolean | null;
  teamName: string | null;
  // "Organisation match à domicile" (retour de Cindy du 17/09) : cible la
  // notification (bell/push coachesOnly) sur l'équipe du match.
  teamId: string | null;
  source: NextEventSource;
  rsvpPlayers: NextEventRsvpPlayer[];
  // Ajoutés le 14/09 (retour de Cindy, "les coachs voient les présents/
  // absents... duplication de l'événement à venir") : même bloc que
  // WeekStripEvent (week-strip-banner.tsx) -- comptage sur l'effectif
  // complet de l'événement, listes nominatives incluses.
  rsvpCounts: { present: number; absent: number; late: number; pending: number };
  presentPlayers: { id: string; firstName: string | null; lastName: string | null }[];
  absentPlayers: { id: string; firstName: string | null; lastName: string | null }[];
  // Retour de Cindy du 18/09 ("voir aussi les joueurs en attente, partout
  // où c'est nécessaire") : même principe que presentPlayers/absentPlayers
  // ci-dessus.
  pendingPlayers: { id: string; firstName: string | null; lastName: string | null }[];
  needs: VolunteerNeed[];
  // "Organisation match à domicile" (retour de Cindy du 17/09) : même bloc
  // que WeekStripEvent (week-strip-banner.tsx), la carte étant partagée.
  matchOfficials: MatchOfficialAssignment[];
  // Toujours true ici (vraie donnée) -- neutralisé à false uniquement côté
  // Espace Enfant, juste après cet appel (voir enfant/view/page.tsx, même
  // frontière que needs=[]/paymentLink=null).
  matchOfficialsEnabled: boolean;
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
  // "won" ajouté le 14/09 (nouvelle grille KPI 2x2, "Victoires" plutôt
  // qu'"Équipes" -- pertinent aussi bien pour le club entier que pour une
  // seule équipe, contrairement à teamCount ci-dessus, toujours null hors
  // Bureau).
  official: { played: number; points: number; won: number };
  friendly: { played: number; points: number; won: number };
  // Retour de Cindy du 14/09 ("le bureau n'a pas qu'un seul entraînement de
  // prévu cette semaine... si plusieurs événements dans la journée, pouvoir
  // les visualiser") : TOUS les événements du jour le plus proche (pas
  // juste le tout premier) -- un tableau plutôt qu'un événement unique,
  // vide si rien à venir.
  nextEvents: SpaceDashboardNextEvent[];
  seasonLabel: string;
};

const EMPTY_MATCH_STATS = { played: 0, points: 0, won: 0 };

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
  rsvpCandidates: { id: string; name: string; teamIds: string[] }[] = [],
  // Retour de Cindy du 14/09 ("ça rame en local"... "je n'arrive pas à me
  // connecter") : ces requêtes ne passaient par AUCUN plafond, alors que
  // tout le reste de page.tsx respecte scrupuleusement le Semaphore
  // partagé (voir batch.ts) pour ne jamais dépasser les 15 connexions
  // Postgres de l'offre Supabase -- un seul chargement (Bureau, Coach OU
  // Famille) ajoutait jusqu'à 8 requêtes strictement simultanées en plus
  // de tout le reste, assez pour déclencher un vrai "statement timeout"
  // Postgres sur une requête complètement différente (getEventTasksByEventId,
  // vu dans les logs). Optionnel avec un plafond local par défaut : cette
  // fonction reste appelable isolément (tests, un futur appelant qui
  // n'aurait pas encore de Semaphore partagé) sans jamais planter.
  dbLimit: Semaphore | number = 4,
  // Retour de Cindy du 14/09 ("les enfants n'ont pas les présents/absents
  // visibles... carte du calendrier = carte du tableau de bord partout") :
  // le remède RLS du même jour (family_teammate_roster plutôt qu'un embed
  // direct sur players) casse silencieusement l'Espace Enfant -- cette vue
  // filtre sur auth.uid()/auth.jwt(), qui n'existe tout simplement pas
  // pour un appel service_role (enfant/view/page.tsx, aucune session
  // utilisateur classique) : 0 ligne visible, roster vide, plus aucun
  // présent/absent. true UNIQUEMENT pour un appelant service_role, déjà
  // hors RLS par construction (service_role la contourne de toute façon
  // sur players) -- toujours côté serveur, jamais un client authentifié
  // classique (Bureau/Coach/Famille gardent la vue, seul rempart contre
  // la fuite corrigée le 28/08 pour EUX).
  trustedRosterAccess = false
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
  // Même normalisation que runBatched (batch.ts) : un Semaphore déjà
  // construit passe tel quel (le Semaphore PARTAGÉ de page.tsx, dans
  // l'usage réel), un simple nombre en construit un local -- getVolunteer
  // NeedsByEventId n'accepte qu'un vrai Semaphore, jamais un nombre.
  const semaphore = dbLimit instanceof Semaphore ? dbLimit : new Semaphore(dbLimit);

  const nowIso = new Date().toISOString();
  const [rosterRes, teamCountRes, photoRes, matchesRes, firstUpcomingRes] = await runBatched(
    [
      () =>
        teamIds === null
          ? supabase.from("players").select("id", { count: "exact", head: true }).is("archived_at", null)
          : supabase.from("team_players").select("player_id").in("team_id", teamIds),
      () =>
        teamIds === null
          ? supabase.from("teams").select("id", { count: "exact", head: true })
          : Promise.resolve({ count: null, data: null, error: null }),
      () =>
        singleTeamId
          ? supabase.from("teams").select("photo_url").eq("id", singleTeamId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      // Matchs (officiels = MATCH, amicaux = FRIENDLY) de la saison en
      // cours, avec un score déjà enregistré -- un match programmé mais
      // pas encore joué (ou dont le score a été oublié) ne doit compter
      // ni dans "joués" ni dans les points. Un tournoi (TOURNAMENT) n'a
      // pas de score unique opposant deux équipes au sens propre --
      // volontairement hors de ces deux compteurs.
      () => {
        let q = supabase
          .from("events")
          .select("event_type, team_score, opponent_score")
          .in("event_type", ["MATCH", "FRIENDLY"])
          .gte("start_time", startIso)
          .lt("start_time", endIso)
          .not("team_score", "is", null);
        if (teamIds !== null) q = q.in("team_id", teamIds);
        return q;
      },
      // Retour de Cindy du 14/09 ("plusieurs événements dans la journée,
      // pouvoir les visualiser") : première étape en deux temps -- juste
      // la date du tout premier événement à venir, pour ensuite borner la
      // vraie requête (plus bas) à CETTE journée entière plutôt qu'à une
      // seule ligne.
      () => {
        let q = supabase
          .from("events")
          .select("start_time")
          .gte("start_time", nowIso)
          .order("start_time", { ascending: true })
          .limit(1);
        if (teamIds !== null) q = q.in("team_id", teamIds);
        return q;
      },
    ],
    semaphore
  );

  const playerCount =
    teamIds === null
      ? (rosterRes as { count: number | null }).count ?? 0
      : new Set(
          ((rosterRes as { data: { player_id: string }[] | null }).data ?? []).map((r) => r.player_id)
        ).size;

  const official = { ...EMPTY_MATCH_STATS };
  const friendly = { ...EMPTY_MATCH_STATS };
  (
    (matchesRes.data ?? []) as { event_type: string; team_score: number | null; opponent_score: number | null }[]
  ).forEach((m) => {
    const bucket = m.event_type === "MATCH" ? official : friendly;
    bucket.played += 1;
    bucket.points += m.team_score ?? 0;
    if ((m.team_score ?? 0) > (m.opponent_score ?? 0)) bucket.won += 1;
  });

  const firstUpcomingStart = (firstUpcomingRes.data ?? [])[0]?.start_time as string | undefined;

  type EventRow = {
    id: string;
    title: string | null;
    event_type: string | null;
    start_time: string;
    // Ajoutés le 14/09 (retour de Cindy, "les cartes du tableau de bord ne
    // ressemblent pas à celles du calendrier") : même parité d'info que
    // renderEventCard (calendar-view.tsx) sur la carte DayEventCard
    // réutilisée ici -- ces champs n'étaient jusqu'ici même pas
    // sélectionnés par cette requête.
    end_time: string | null;
    impact_time: string | null;
    notes: string | null;
    location: string | null;
    salle: string | null;
    is_home: boolean | null;
    team_id: string | null;
    target_team_ids: string[] | null;
    teams: { name: string | null } | null;
    // "Événement payant" (voir resolvePaidInfo, page.tsx) : dérivé de la
    // présence d'une collecte rattachée (collectes.event_id), jamais
    // stocké sur events -- même jointure inverse, réduite au seul champ
    // dont cette carte a besoin (pas de liste de participants ici).
    collectes: { payment_link: string | null } | { payment_link: string | null }[] | null;
  };

  // Version réduite de resolvePaidInfo (page.tsx) : cette carte n'affiche
  // que le badge "Payant" + le bouton "Payer", jamais la liste des
  // inscrits -- pas besoin de porter collecteId/paidAmount/paidParticipants
  // jusqu'ici.
  function resolvePaidFields(collectes: EventRow["collectes"]): {
    isPaid: boolean;
    paymentLink: string | null;
  } {
    const rows = Array.isArray(collectes) ? collectes : collectes ? [collectes] : [];
    return rows.length > 0
      ? { isPaid: true, paymentLink: rows[0].payment_link }
      : { isPaid: false, paymentLink: null };
  }

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
        "id, title, event_type, start_time, end_time, impact_time, notes, location, salle, is_home, team_id, target_team_ids, teams(name), collectes(payment_link)"
      )
      .gte("start_time", nowIso)
      .lt("start_time", dayEnd)
      .order("start_time", { ascending: true });
    if (teamIds !== null) dayQuery = dayQuery.in("team_id", teamIds);
    const [{ data }] = await runBatched([() => dayQuery], semaphore);
    dayRows = (data ?? []) as unknown as EventRow[];
  }

  let nextEvents: SpaceDashboardNextEvent[] = [];
  if (dayRows.length > 0) {
    const eventIds = dayRows.map((r) => r.id);
    // Réutilise telle quelle la même fonction que le reste de l'appli
    // (VolunteerNeedsPanel, calendar-view.tsx...) -- jamais une requête
    // event_volunteer_needs/signups dupliquée ici. Un seul appel pour
    // TOUS les événements du jour plutôt qu'un par carte.
    const needsByEventId = await getVolunteerNeedsByEventId(supabase, eventIds, semaphore);
    // "Organisation match à domicile" (retour de Cindy du 17/09) : même
    // principe que needsByEventId juste au-dessus.
    const matchOfficialsByEventId = await getMatchOfficialRolesByEventId(supabase, eventIds, semaphore);

    // Retour de Cindy du 14/09 ("les coachs voient les présents/absents...
    // duplication de l'événement à venir") : même bloc compteurs +
    // "Qui sera là ?"/"Qui est absent ?" que renderEventCard
    // (calendar-view.tsx), sur tous les espaces -- besoin de l'effectif
    // COMPLET (pas seulement rsvpCandidates, qui ne couvre que les
    // enfants de la Famille pour son propre bouton). Un joueur peut
    // apparaître dans plusieurs lignes team_players (multi-équipes) :
    // dédupliqué par id, ses team_id cumulés pour repasser dans
    // isConcernedByEvent.
    //
    // Bug trouvé le 14/09 (retour de Cindy, "8 présentes à l'entraînement
    // mais je n'en vois qu'une, la mienne") : un embed direct
    // team_players.players(...) ne renvoyait, pour un parent, QUE ses
    // propres enfants -- la policy RLS "select own or linked players" ne
    // laisse un parent lire que ses fiches liées, jamais celles de ses
    // coéquipiers (la policy plus permissive a été retirée le 28/08 au
    // profit de family_teammate_roster, précisément pour cette raison,
    // voir 20261029000000_family_teammate_roster_view.sql -- déjà
    // contourné ainsi pour "Mon Équipe" côté Famille, page.tsx). Même
    // remède ici : team_players donne les liens (id/équipe, jamais
    // filtrés), family_teammate_roster donne les noms (vue dédiée,
    // conçue pour être lisible par le Bureau ET tout parent/coach d'un
    // coéquipier).
    let linksQuery = supabase.from("team_players").select("team_id, player_id");
    if (teamIds !== null) linksQuery = linksQuery.in("team_id", teamIds);
    const [{ data: linkRows }] = await runBatched([() => linksQuery], semaphore);
    const rosterPlayerIds = Array.from(new Set((linkRows ?? []).map((r) => r.player_id)));
    // trustedRosterAccess (service_role, Espace Enfant) : la vue plus haut
    // ne peut rien renvoyer sans auth.uid()/auth.jwt() -- lecture directe
    // de players à la place, sans risque puisque déjà hors RLS par
    // construction et strictement limitée à 3 colonnes (id/prénom/nom),
    // jamais le reste de la fiche.
    const [{ data: rosterNameRows }] = await runBatched(
      [
        () =>
          rosterPlayerIds.length === 0
            ? Promise.resolve({
                data: [] as { id: string; first_name: string | null; last_name: string | null }[],
                error: null,
              })
            : trustedRosterAccess
              ? supabase.from("players").select("id, first_name, last_name").in("id", rosterPlayerIds)
              : supabase.from("family_teammate_roster").select("id, first_name, last_name").in("id", rosterPlayerIds),
      ],
      semaphore
    );
    const nameById = new Map((rosterNameRows ?? []).map((p) => [p.id, p]));
    const rosterByPlayerId = new Map<
      string,
      { id: string; firstName: string | null; lastName: string | null; teamIds: string[] }
    >();
    (linkRows ?? []).forEach((r) => {
      const name = nameById.get(r.player_id);
      // Cas normalement impossible (tout joueur d'une équipe visible via
      // teamIds est forcément couvert par family_teammate_roster) -- même
      // filet de sécurité que page.tsx, pas de ligne fantôme sans nom.
      if (!name) return;
      const existing = rosterByPlayerId.get(r.player_id);
      if (existing) existing.teamIds.push(r.team_id);
      else
        rosterByPlayerId.set(r.player_id, {
          id: r.player_id,
          firstName: name.first_name,
          lastName: name.last_name,
          teamIds: [r.team_id],
        });
    });
    const fullRoster = Array.from(rosterByPlayerId.values());

    // Une seule requête rsvps pour tous les événements du jour à la fois,
    // sur TOUT l'effectif (retour de Cindy du 13/09, "pour les parents
    // pouvoir y répondre ici" + celui du 14/09 ci-dessus) -- jamais un 2e
    // .in("player_id", ...) en plus de .in("event_id", ...) : même classe
    // de bug que l'incident du 30/08 (batch.ts), une URL démesurée sur un
    // effectif de club entier. eventIds reste petit (un seul jour), donc
    // seul lui filtre côté requête ; le rapprochement par joueur se fait
    // en mémoire juste en dessous.
    const [{ data: rsvpRows }] = await runBatched(
      [() => supabase.from("rsvps").select("event_id, player_id, status").in("event_id", eventIds)],
      semaphore
    );
    const statusByEventAndPlayer = new Map<string, string>();
    ((rsvpRows ?? []) as { event_id: string; player_id: string; status: string }[]).forEach((r) => {
      statusByEventAndPlayer.set(`${r.event_id}:${r.player_id}`, r.status);
    });

    nextEvents = dayRows.map((row) => {
      const paidFields = resolvePaidFields(row.collectes);
      const eventRoster = fullRoster.filter((p) => isConcernedByEvent(p, row));
      let present = 0;
      let absent = 0;
      let late = 0;
      let answered = 0;
      const presentPlayers: { id: string; firstName: string | null; lastName: string | null }[] = [];
      const absentPlayers: { id: string; firstName: string | null; lastName: string | null }[] = [];
      const pendingPlayers: { id: string; firstName: string | null; lastName: string | null }[] = [];
      eventRoster.forEach((p) => {
        const status = statusByEventAndPlayer.get(`${row.id}:${p.id}`);
        if (!status) {
          pendingPlayers.push(p);
          return;
        }
        answered += 1;
        if (status === "PRESENT") {
          present += 1;
          presentPlayers.push(p);
        } else if (status === "ABSENT") {
          absent += 1;
          absentPlayers.push(p);
        } else if (status === "LATE") {
          late += 1;
        }
      });
      return {
        id: row.id,
        title: row.title,
        eventType: row.event_type,
        startTime: row.start_time,
        endTime: row.end_time,
        impactTime: row.impact_time,
        notes: row.notes,
        isPaid: paidFields.isPaid,
        paymentLink: paidFields.paymentLink,
        location: row.location,
        salle: row.salle,
        isHome: row.is_home,
        teamName: row.teams?.name ?? null,
        teamId: row.team_id,
        source,
        rsvpPlayers: rsvpCandidates
          .filter((p) => isConcernedByEvent(p, row))
          .map((p) => ({
            id: p.id,
            name: p.name,
            status: statusByEventAndPlayer.get(`${row.id}:${p.id}`) ?? "PENDING",
          })),
        rsvpCounts: { present, absent, late, pending: Math.max(0, eventRoster.length - answered) },
        presentPlayers,
        absentPlayers,
        pendingPlayers,
        needs: needsByEventId[row.id] ?? [],
        matchOfficials: matchOfficialsByEventId[row.id] ?? [],
        matchOfficialsEnabled: true,
      };
    });
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
