import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFfbbTeamCalendar } from "@/lib/ffbb";

// Retour de Cindy du 15/09 ("ça tourne dans le vide") : le fetch vers la
// FFBB a désormais sa propre limite de 20s (voir ffbb.ts), mais sans
// budget explicite ici, Vercel pouvait couper cette fonction avant ce
// délai (limite par défaut de la plateforme) -- la coupure brutale d'une
// fonction ne renvoie pas toujours une réponse propre au client, qui
// continuait alors d'attendre. 30s laisse une marge confortable au-delà
// du timeout interne de fetchFfbbTeamCalendar.
export const maxDuration = 30;

export async function POST(request: Request) {
  const { teamId } = await request.json();

  if (!teamId) {
    return NextResponse.json({ error: "teamId requis." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // La policy RLS "coach update own teams" empêchait déjà une écriture non
  // autorisée, mais silencieusement : l'appelant recevait un 200 avec des
  // compteurs à 0, indistinguable d'une synchro qui n'a simplement rien
  // trouvé de neuf. Vérifié explicitement ici pour renvoyer un vrai 403.
  const [{ data: coachRow }, { data: adminRow }] = await Promise.all([
    // Retour d'audit du 28/08 : team_coaches n'a pas de colonne
    // "profile_id" (c'est "coach_id" partout ailleurs dans le code) —
    // PostgREST rejetait cette requête pour TOUS les coachs, qui
    // tombaient donc systématiquement sur le 403 juste en dessous.
    supabase.from("team_coaches").select("team_id").eq("team_id", teamId).eq("coach_id", user.id).maybeSingle(),
    supabase.from("club_administrators").select("email").eq("email", (user.email ?? "").toLowerCase()).maybeSingle(),
  ]);
  if (!coachRow && !adminRow) {
    return NextResponse.json({ error: "Non autorisé pour cette équipe." }, { status: 403 });
  }

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, ffbb_url")
    .eq("id", teamId)
    .single();

  if (teamError || !team?.ffbb_url) {
    return NextResponse.json(
      { error: "Aucun lien FFBB configuré pour cette équipe." },
      { status: 400 }
    );
  }

  let matches;
  try {
    matches = await fetchFfbbTeamCalendar(team.ffbb_url);
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer la fiche FFBB." },
      { status: 502 }
    );
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
    console.error("[sync-ffbb] maj de ffbb_last_synced_at échouée:", syncedAtError);
  }

  if (matches.length === 0) {
    return NextResponse.json({
      imported: 0,
      updated: 0,
      message: "Aucun match trouvé sur cette fiche FFBB.",
    });
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Retour de Cindy du 20/09 ("une synchro FFBB fait tout planter") : cette
  // boucle faisait jusqu'ici 1 SELECT + 1 INSERT/UPDATE PAR match, en
  // séquence -- jusqu'à une soixantaine d'allers-retours base de données
  // pour une seule synchro d'équipe, chacun gardant une connexion ouverte
  // le temps de sa réponse. Combiné à un double-clic sur "Synchroniser"
  // après une "erreur" (réflexe naturel) et au trafic normal du tableau de
  // bord (~90 requêtes par chargement), ça suffit à saturer le pool de
  // connexions limité du palier Micro. Remplacé par : un seul SELECT groupé
  // (tous les external_uid de cette synchro en une requête), un seul INSERT
  // groupé pour tous les nouveaux matchs, et une UPDATE par match SEULEMENT
  // s'il a vraiment changé (le cas courant d'une re-synchro sans rien de
  // neuf ne fait plus AUCUN aller-retour d'écriture).
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
    }));

  if (candidates.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("events")
      .select("id, external_uid, title, location, start_time")
      .eq("team_id", teamId)
      .in(
        "external_uid",
        candidates.map((c) => c.externalUid)
      );

    if (existingError) {
      console.error("[sync-ffbb] select events existants échoué:", existingError);
      return NextResponse.json({ error: "La synchronisation a échoué." }, { status: 500 });
    }

    const existingByUid = new Map((existingRows ?? []).map((r) => [r.external_uid, r]));

    const toInsert = candidates.filter((c) => !existingByUid.has(c.externalUid));
    const toUpdate = candidates.filter((c) => {
      const existing = existingByUid.get(c.externalUid);
      if (!existing) return false;
      return (
        existing.title !== c.title ||
        existing.location !== c.location ||
        existing.start_time !== c.startTime
      );
    });

    if (toInsert.length > 0) {
      const { error } = await supabase.from("events").insert(
        toInsert.map((c) => ({
          title: c.title,
          event_type: "MATCH" as const,
          location: c.location,
          start_time: c.startTime,
          team_id: teamId,
          external_uid: c.externalUid,
        }))
      );
      if (!error) inserted += toInsert.length;
    }

    for (const c of toUpdate) {
      const existing = existingByUid.get(c.externalUid)!;
      const { error } = await supabase
        .from("events")
        .update({
          title: c.title,
          event_type: "MATCH" as const,
          location: c.location,
          start_time: c.startTime,
        })
        .eq("id", existing.id);
      if (!error) updated += 1;
    }
  }

  return NextResponse.json({ imported: inserted, updated, skipped });
}
