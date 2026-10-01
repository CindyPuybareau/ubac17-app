import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchFfbbTeamCalendar, fetchFfbbTeamRanking, FfbbFetchError } from "./ffbb";

export type FfbbSyncResult =
  | { ok: true; imported: number; updated: number; skipped: number; message?: string }
  | { ok: false; status: number; error: string };

export type FfbbRankingSyncResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

// Extrait de l'ancienne route sync-ffbb (retour de Cindy du 01/10,
// "comment je synchroniserais ?") : la FFBB (BunnyCDN Shield) bloque les
// IP de datacenter, donc Vercel, mais pas une IP résidentielle (voir
// scripts/sync-ffbb-all.ts, lancé depuis une tâche planifiée locale).
// Logique de lecture/écriture identique dans les deux cas -- extraite ici
// pour n'exister qu'UNE fois, peu importe le client Supabase utilisé
// (session utilisateur côté route API, service_role côté script local).
export async function syncFfbbMatchesForTeam(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  teamId: string,
  ffbbUrl: string
): Promise<FfbbSyncResult> {
  let matches;
  try {
    matches = await fetchFfbbTeamCalendar(ffbbUrl);
  } catch (e) {
    // Retour de Cindy du 30/09 ("impossible de récupérer la fiche FFBB")
    // persistant en production après le correctif des en-têtes (voir
    // ffbb.ts) : logué avec le statut HTTP réel + le repli "shield"
    // (BunnyCDN) pour diagnostiquer depuis le dashboard Vercel (Logs) ou la
    // sortie console du script local.
    if (e instanceof FfbbFetchError) {
      console.error(
        `[ffbb-sync] fetch échoué (team ${teamId}): status=${e.status ?? "réseau/timeout"} shield=${e.shieldChallenge} message=${e.message}`
      );
    } else {
      console.error(`[ffbb-sync] fetch échoué (team ${teamId}):`, e);
    }
    return { ok: false, status: 502, error: "Impossible de récupérer la fiche FFBB." };
  }

  // Posé dès qu'on a réussi à parler à la FFBB pour cette équipe — pas
  // seulement quand des matchs ont réellement changé — pour que la vue
  // d'ensemble (ffbb-manager.tsx) distingue "synchronisé, rien de neuf"
  // d'"jamais synchronisé".
  const { error: syncedAtError } = await supabase
    .from("teams")
    .update({ ffbb_last_synced_at: new Date().toISOString() })
    .eq("id", teamId);
  // Non bloquant (les matchs ci-dessous sont le vrai résultat de la
  // synchro) mais logué (audit du 31/08) : sans ça, un échec silencieux ici
  // laisserait ffbb-manager.tsx afficher "Jamais synchronisé"/une date
  // obsolète malgré une synchro par ailleurs réussie.
  if (syncedAtError) {
    console.error("[ffbb-sync] maj de ffbb_last_synced_at échouée:", syncedAtError);
  }

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
      .select("id, external_uid, title, location, start_time, team_score, opponent_score")
      .eq("team_id", teamId)
      .eq("event_type", "MATCH");

    if (existingError) {
      console.error("[ffbb-sync] select events existants échoué:", existingError);
      return { ok: false, status: 500, error: "La synchronisation a échoué." };
    }

    const existingByUid = new Map((existingRows ?? []).map((r) => [r.external_uid, r]));
    // Clé numérique (epoch), pas la chaîne brute : Supabase ne renvoie pas
    // forcément start_time dans le même format ISO que celui produit ici
    // (toISOString(), voir ffbb.ts) -- une comparaison de chaînes ratait
    // silencieusement des horaires pourtant identiques.
    const existingByStartTime = new Map(
      (existingRows ?? []).map((r) => [new Date(r.start_time).getTime(), r])
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
        }))
      );
      if (!error) inserted += toInsert.length;
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
      if (!error) updated += 1;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  teamId: string,
  ffbbUrl: string
): Promise<FfbbRankingSyncResult> {
  let entries;
  try {
    entries = await fetchFfbbTeamRanking(ffbbUrl);
  } catch (e) {
    if (e instanceof FfbbFetchError) {
      console.error(
        `[ffbb-sync] classement : fetch échoué (team ${teamId}): status=${e.status ?? "réseau/timeout"} shield=${e.shieldChallenge} message=${e.message}`
      );
    } else {
      console.error(`[ffbb-sync] classement : fetch échoué (team ${teamId}):`, e);
    }
    return { ok: false, error: "Impossible de récupérer le classement FFBB." };
  }

  // Remplacé en entier (voir migration team_rankings_from_local_sync) :
  // un classement n'a aucune donnée club rattachée ligne à ligne, DELETE +
  // INSERT reflète fidèlement l'état actuel sans ligne fantôme d'une
  // équipe reléguée/promue entre deux synchros.
  const { error: deleteError } = await supabase.from("team_rankings").delete().eq("team_id", teamId);
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
    }))
  );
  if (insertError) {
    console.error("[ffbb-sync] classement : insertion échouée:", insertError);
    return { ok: false, error: "La synchronisation du classement a échoué." };
  }

  return { ok: true, count: entries.length };
}
