import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchFfbbTeamCalendar } from "@/lib/ffbb";

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

  for (const match of matches) {
    if (!match.startTime) {
      skipped += 1;
      continue;
    }

    const externalUid = `ffbb-${match.matchNumber}`;
    const title = match.opponent
      ? `${match.isHome ? "vs" : "@"} ${match.opponent}`
      : `Match ${match.journee}`;

    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("team_id", teamId)
      .eq("external_uid", externalUid)
      .maybeSingle();

    const payload = {
      title,
      event_type: "MATCH" as const,
      location: match.isHome ? "Domicile" : "Extérieur",
      start_time: match.startTime,
    };

    if (existing) {
      const { error } = await supabase
        .from("events")
        .update(payload)
        .eq("id", existing.id);
      if (!error) updated += 1;
    } else {
      const { error } = await supabase.from("events").insert({
        ...payload,
        team_id: teamId,
        external_uid: externalUid,
      });
      if (!error) inserted += 1;
    }
  }

  return NextResponse.json({ imported: inserted, updated, skipped });
}
