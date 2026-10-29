import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchFfbbTeamCalendar,
  fetchFfbbTeamPageData,
  fetchFfbbTeamRanking,
  FfbbFetchError,
  type FfbbMatch,
  type FfbbRankingEntry,
} from "./ffbb";
import { FFBB_PHASE_1_OR_NULL_FILTER, normalizeFfbbPhase, type FfbbPhase } from "./ffbb-phase";

export type FfbbSyncResult =
  | { ok: true; imported: number; updated: number; skipped: number; message?: string }
  | { ok: false; status: number; error: string };

export type FfbbRankingSyncResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

// Extrait de l'ancienne route sync-ffbb (retour de Cindy du 01/10,
// "comment je synchroniserais ?") : la FFBB (BunnyCDN Shield) bloque les
// IP de datacenter, donc Vercel, mais pas une IP résidentielle (voir
// scripts/sync-ffbb-all.ts, lancé depuis une tâche planifiée locale).
// Logique de lecture/écriture identique dans les deux cas -- extraite ici
// pour n'exister qu'UNE fois, peu importe le client Supabase utilisé
// (session utilisateur côté route API, service_role côté script local).
//
// Écriture séparée du fetch (writeMatchesForTeam ci-dessous) : réutilisée
// telle quelle par syncFfbbTeamForTeam, qui ne fait qu'UN SEUL fetch de la
// fiche FFBB pour matchs + classement au lieu de deux (retour de Cindy du
// 01/10, "les requêtes sont impeccables ?").
export async function syncFfbbMatchesForTeam(
  supabase: AnySupabaseClient,
  teamId: string,
  ffbbUrl: string,
  // Retour de Cindy du 29/10 ("je veux du propre") : obligatoire, jamais
  // défaulté -- un appelant qui oublierait de le préciser écrirait
  // silencieusement ffbb_phase=1 au lieu d'échouer. Les deux appelants
  // (api/sync-ffbb/route.ts, scripts/sync-ffbb-all.ts) le déterminent déjà
  // explicitement avant d'appeler cette fonction.
  phase: FfbbPhase
): Promise<FfbbSyncResult> {
  let matches;
  try {
    matches = await fetchFfbbTeamCalendar(ffbbUrl);
  } catch (e) {
    return handleFetchError(e, teamId);
  }
  const result = await writeMatchesForTeam(supabase, teamId, matches, phase);
  // Posé dès qu'on a réussi à parler à la FFBB pour cette équipe — pas
  // seulement quand des matchs ont réellement changé — pour que la vue
  // d'ensemble (ffbb-manager.tsx) distingue "synchronisé, rien de neuf"
  // d'"jamais synchronisé". Un seul appelant ici (une équipe à la fois) :
  // pas de risque de rafale temps réel (voir syncFfbbTeamForTeam plus bas
  // pour le cas du script, qui bat toutes les équipes d'un coup).
  await touchSyncedAt(supabase, [teamId]);
  return result;
}

// Retour de Cindy du 01/10 ("fais le nécessaire pour le code") : exportée
// pour que scripts/sync-ffbb-all.ts l'appelle UNE SEULE FOIS, pour toutes
// les équipes synchronisées avec succès, à la toute fin de son passage --
// plutôt qu'une fois par équipe (voir syncFfbbMatchesForTeam ci-dessus,
// qui continue de le faire pour SON unique équipe). RealtimeSync
// (dashboard) écoute la table "teams" : huit écritures espacées dans le
// temps (une par équipe, au fil des fetches FFBB successifs) déclenchaient
// jusqu'à huit rechargements complets du tableau de bord pour TOUT le
// monde connecté -- une seule écriture groupée à la fin ne déclenche plus
// qu'un seul rechargement, quel que soit le nombre d'équipes.
export async function touchSyncedAt(supabase: AnySupabaseClient, teamIds: string[]): Promise<void> {
  if (teamIds.length === 0) return;
  const { error } = await supabase
    .from("teams")
    .update({ ffbb_last_synced_at: new Date().toISOString() })
    .in("id", teamIds);
  // Non bloquant (les matchs sont le vrai résultat de la synchro) mais
  // logué (audit du 31/08) : sans ça, un échec silencieux ici laisserait
  // ffbb-manager.tsx afficher "Jamais synchronisé"/une date obsolète
  // malgré une synchro par ailleurs réussie.
  if (error) {
    console.error("[ffbb-sync] maj de ffbb_last_synced_at échouée:", error);
  }
}

async function writeMatchesForTeam(
  supabase: AnySupabaseClient,
  teamId: string,
  matches: FfbbMatch[],
  phase: FfbbPhase
): Promise<FfbbSyncResult> {
  if (matches.length === 0) {
    return { ok: true, imported: 0, updated: 0, skipped: 0, message: "Aucun match trouvé sur cette fiche FFBB." };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Retour de Cindy du 20/09 ("une synchro FFBB fait tout planter") : cette
  // boucle faisait jusqu'ici 1 SELECT + 1 INSERT/UPDATE PAR match, en
  // séquence -- jusqu'à une soixantaine d'allers-retours base de données
  // pour une seule synchro d'équipe, chacun gardant une connexion ouverte
  // le temps de sa réponse. Remplacé par : un seul SELECT groupé (tous les
  // external_uid de cette synchro en une requête), un seul INSERT groupé
  // pour tous les nouveaux matchs, et une UPDATE par match SEULEMENT s'il a
  // vraiment changé (le cas courant d'une re-synchro sans rien de neuf ne
  // fait plus AUCUN aller-retour d'écriture).
  const candidates = matches
    .filter((m) => {
      if (!m.startTime) {
        skipped += 1;
        return false;
      }
      return true;
    })
    .map((m) => ({
      externalUid: `ffbb-${m.matchNumber}`,
      title: m.opponent ? `${m.isHome ? "vs" : "@"} ${m.opponent}` : `Match ${m.journee}`,
      location: m.isHome ? "Domicile" : "Extérieur",
      startTime: m.startTime as string,
      // Retour de Cindy du 21/09 ("les résultats ne s'affichent pas en
      // automatique dans les cartes") : voir ownScore/opponentScore dans
      // FfbbMatch (lib/ffbb.ts) -- null tant que la FFBB n'a pas encore
      // publié le score.
      ownScore: m.ownScore,
      opponentScore: m.opponentScore,
    }));

  if (candidates.length > 0) {
    // Retour de Cindy du 21/09 ("un match qui s'ajoute à celui réel à la
    // même date, je ne le vois même pas sur la FFBB") : la FFBB renumérote
    // parfois un match déjà synchronisé. external_uid ("ffbb-693") reste
    // donc figé sur l'ancien numéro : sans repli, "ffbb-691" ne correspond
    // à aucune ligne connue, la synchro le prend pour un TOUT NOUVEAU match
    // et le crée en double à côté du vrai (cette fonction ne supprime
    // jamais rien). D'où l'élargissement de la lecture à tout l'historique
    // de matchs de l'équipe (une seule requête, toujours) et le repli par
    // (team_id, start_time) : une équipe ne joue qu'un seul match à un
    // instant donné, une correspondance ici veut donc dire "même match
    // renuméroté", pas un second match.
    const { data: existingRows, error: existingError } = await supabase
      .from("events")
      .select("id, external_uid, title, location, start_time, team_score, opponent_score, ffbb_phase")
      .eq("team_id", teamId)
      .eq("event_type", "MATCH");

    if (existingError) {
      console.error("[ffbb-sync] select events existants échoué:", existingError);
      return { ok: false, status: 500, error: "La synchronisation a échoué." };
    }

    // Retour de Cindy du 29/10 ("je veux du propre") : la correspondance
    // (par external_uid OU par repli start_time, voir ci-dessus) doit
    // rester DANS la phase qu'on resynchronise -- sans ce filtre, un match
    // Phase 2 dont le numéro FFBB (#1, #2...) repart de zéro sur la
    // nouvelle poule peut retomber sur le même "ffbb-1" qu'un match Phase 1
    // pourtant gelé pour toujours (voir migration ffbb_phase2), et
    // l'écraser (titre/horaire/score) au lieu d'être inséré comme un
    // nouveau match. Même garde-fou que la purge phase-scopée de
    // writeRankingForTeam plus bas, appliqué ici à la recherche plutôt
    // qu'à une suppression.
    const phaseRows = (existingRows ?? []).filter(
      (r) => normalizeFfbbPhase(r.ffbb_phase) === normalizeFfbbPhase(phase)
    );
    const existingByUid = new Map(phaseRows.map((r) => [r.external_uid, r]));
    // Clé numérique (epoch), pas la chaîne brute : Supabase ne renvoie pas
    // forcément start_time dans le même format ISO que celui produit ici
    // (toISOString(), voir ffbb.ts) -- une comparaison de chaînes ratait
    // silencieusement des horaires pourtant identiques.
    const existingByStartTime = new Map(
      phaseRows.map((r) => [new Date(r.start_time).getTime(), r])
    );

    const toInsert: typeof candidates = [];
    const toUpdate: { id: string; candidate: (typeof candidates)[number] }[] = [];

    for (const c of candidates) {
      const byUid = existingByUid.get(c.externalUid);
      if (byUid) {
        const scoreChanged =
          c.ownScore != null &&
          (byUid.team_score !== c.ownScore || byUid.opponent_score !== c.opponentScore);
        if (
          byUid.title !== c.title ||
          byUid.location !== c.location ||
          new Date(byUid.start_time).getTime() !== new Date(c.startTime).getTime() ||
          scoreChanged
        ) {
          toUpdate.push({ id: byUid.id, candidate: c });
        }
        continue;
      }
      const byStartTime = existingByStartTime.get(new Date(c.startTime).getTime());
      if (byStartTime) {
        toUpdate.push({ id: byStartTime.id, candidate: c });
        continue;
      }
      toInsert.push(c);
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("events").insert(
        toInsert.map((c) => ({
          title: c.title,
          event_type: "MATCH" as const,
          location: c.location,
          start_time: c.startTime,
          team_id: teamId,
          external_uid: c.externalUid,
          team_score: c.ownScore,
          opponent_score: c.opponentScore,
          // Retour de Cindy du 28/10 ("phase 1 -> phase 2") : posée une
          // fois pour toutes à l'import, jamais retouchée ensuite --
          // une phase ne change pas de numéro une fois le match créé.
          ffbb_phase: phase,
        }))
      );
      // Retour de Cindy du 01/10 ("regarde les logs") : une erreur ici
      // (ex. "new row violates row-level security policy for table
      // notifications", vue en direct ce jour-là -- déclencheur
      // notify_event_change sur events) passait jusqu'ici totalement
      // inaperçue : ni logué, ni distingué d'un vrai succès à 0 ligne.
      if (error) {
        console.error(`[ffbb-sync] insert events échoué (team ${teamId}):`, error);
      } else {
        inserted += toInsert.length;
      }
    }

    for (const { id, candidate: c } of toUpdate) {
      const { error } = await supabase
        .from("events")
        .update({
          title: c.title,
          event_type: "MATCH" as const,
          location: c.location,
          start_time: c.startTime,
          // Adopte le nouveau numéro FFBB sur la ligne déjà là (cas du
          // repli par start_time) -- les prochaines synchros la
          // retrouveront directement par external_uid, plus par repli.
          external_uid: c.externalUid,
          // Retour de Cindy du 28/10 : comble au passage une ligne jamais
          // étiquetée (ffbb_phase NULL, importée avant ce chantier) --
          // sans effet sur une ligne de l'autre phase désormais, puisque
          // phaseRows plus haut garantit que `id` vient forcément de la
          // phase qu'on resynchronise (correctif du 29/10 -- voir le
          // commentaire sur phaseRows).
          ffbb_phase: phase,
          // Retour de Cindy du 21/09 ("les résultats ne s'affichent pas en
          // automatique") : uniquement quand la FFBB a réellement publié
          // un score (jamais null) -- sinon un score déjà saisi à la main
          // avant que la FFBB publie le sien se ferait écraser par du vide
          // à chaque re-synchro.
          ...(c.ownScore != null
            ? { team_score: c.ownScore, opponent_score: c.opponentScore }
            : {}),
        })
        .eq("id", id);
      if (error) {
        console.error(`[ffbb-sync] update events échoué (team ${teamId}, event ${id}):`, error);
      } else {
        updated += 1;
      }
    }
  }

  return { ok: true, imported: inserted, updated, skipped };
}

// Retour de Cindy du 01/10 ("ajouter le classement à la synchro
// automatique du lundi") : /api/ffbb-ranking lisait jusqu'ici le classement
// EN DIRECT depuis le serveur Vercel -- bloqué par la FFBB exactement comme
// la synchro des matchs (voir syncFfbbMatchesForTeam ci-dessus). Même
// principe : un instantané stocké dans team_rankings, écrit UNIQUEMENT par
// scripts/sync-ffbb-all.ts (IP résidentielle), lu ensuite sans aucun appel
// FFBB par /api/ffbb-ranking.
export async function syncFfbbRankingForTeam(
  supabase: AnySupabaseClient,
  teamId: string,
  ffbbUrl: string,
  phase: FfbbPhase
): Promise<FfbbRankingSyncResult> {
  let entries;
  try {
    entries = await fetchFfbbTeamRanking(ffbbUrl);
  } catch (e) {
    return handleRankingFetchError(e, teamId);
  }
  return writeRankingForTeam(supabase, teamId, entries, phase);
}

async function writeRankingForTeam(
  supabase: AnySupabaseClient,
  teamId: string,
  entries: FfbbRankingEntry[],
  phase: FfbbPhase
): Promise<FfbbRankingSyncResult> {
  // Remplacé en entier (voir migration team_rankings_from_local_sync) :
  // un classement n'a aucune donnée club rattachée ligne à ligne, DELETE +
  // INSERT reflète fidèlement l'état actuel sans ligne fantôme d'une
  // équipe reléguée/promue entre deux synchros.
  // Retour de Cindy du 28/10 ("phase 1 -> phase 2") : purge limitée à
  // CETTE phase -- sans ça, resynchroniser la phase 2 d'une équipe
  // effacerait aussi son classement de phase 1, pourtant censé rester gelé
  // pour toujours. Phase 1 inclut les lignes jamais étiquetées (NULL,
  // importées avant ce chantier) en plus de celles déjà marquées "1" --
  // la phase 2, elle, ne correspond jamais à une ligne NULL (aucune ligne
  // de phase 1 n'a pu être écrite par un appel phase=2).
  let deleteQuery = supabase.from("team_rankings").delete().eq("team_id", teamId);
  deleteQuery =
    phase === 1
      ? deleteQuery.or(FFBB_PHASE_1_OR_NULL_FILTER)
      : deleteQuery.eq("ffbb_phase", phase);
  const { error: deleteError } = await deleteQuery;
  if (deleteError) {
    console.error("[ffbb-sync] classement : purge précédente échouée:", deleteError);
    return { ok: false, error: "La synchronisation du classement a échoué." };
  }

  if (entries.length === 0) {
    return { ok: true, count: 0 };
  }

  const { error: insertError } = await supabase.from("team_rankings").insert(
    entries.map((e, i) => ({
      team_id: teamId,
      sort_order: i,
      position: e.position,
      label: e.label,
      points: e.points,
      previous_ranking: e.previousRanking,
      is_own_team: e.isOwnTeam,
      logo: e.logo,
      ffbb_phase: phase,
    }))
  );
  if (insertError) {
    console.error("[ffbb-sync] classement : insertion échouée:", insertError);
    return { ok: false, error: "La synchronisation du classement a échoué." };
  }

  return { ok: true, count: entries.length };
}

// Retour de Cindy du 01/10 ("les requêtes sont impeccables ?") : utilisé
// par scripts/sync-ffbb-all.ts, qui a besoin des DEUX (matchs + classement)
// pour chaque équipe -- UN SEUL fetch de la fiche FFBB (fetchFfbbTeamPageData)
// au lieu des deux fetches indépendants que faisaient jusqu'ici
// syncFfbbMatchesForTeam + syncFfbbRankingForTeam pour la même page.
export async function syncFfbbTeamForTeam(
  supabase: AnySupabaseClient,
  teamId: string,
  ffbbUrl: string,
  phase: FfbbPhase
): Promise<{ matches: FfbbSyncResult; ranking: FfbbRankingSyncResult }> {
  let data;
  try {
    data = await fetchFfbbTeamPageData(ffbbUrl);
  } catch (e) {
    const matchesError = handleFetchError(e, teamId);
    const rankingError = handleRankingFetchError(e, teamId, /* alreadyLogged */ true);
    return { matches: matchesError, ranking: rankingError };
  }
  const [matches, ranking] = await Promise.all([
    writeMatchesForTeam(supabase, teamId, data.matches, phase),
    writeRankingForTeam(supabase, teamId, data.ranking, phase),
  ]);
  return { matches, ranking };
}

// Retour de Cindy du 30/09 ("impossible de récupérer la fiche FFBB")
// persistant en production après le correctif des en-têtes (voir ffbb.ts) :
// logué avec le statut HTTP réel + le repli "shield" (BunnyCDN) pour
// diagnostiquer depuis le dashboard Vercel (Logs) ou la sortie console du
// script local.
function handleFetchError(e: unknown, teamId: string): FfbbSyncResult {
  if (e instanceof FfbbFetchError) {
    console.error(
      `[ffbb-sync] fetch échoué (team ${teamId}): status=${e.status ?? "réseau/timeout"} shield=${e.shieldChallenge} message=${e.message}`
    );
  } else {
    console.error(`[ffbb-sync] fetch échoué (team ${teamId}):`, e);
  }
  return { ok: false, status: 502, error: "Impossible de récupérer la fiche FFBB." };
}

function handleRankingFetchError(e: unknown, teamId: string, alreadyLogged = false): FfbbRankingSyncResult {
  if (!alreadyLogged) {
    if (e instanceof FfbbFetchError) {
      console.error(
        `[ffbb-sync] classement : fetch échoué (team ${teamId}): status=${e.status ?? "réseau/timeout"} shield=${e.shieldChallenge} message=${e.message}`
      );
    } else {
      console.error(`[ffbb-sync] classement : fetch échoué (team ${teamId}):`, e);
    }
  }
  return { ok: false, error: "Impossible de récupérer le classement FFBB." };
}
