import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { FFBB_PHASE_2, normalizeFfbbPhase, FFBB_PHASE_1 } from "@/lib/ffbb-phase";

// Retour de Cindy du 01/10 ("ajouter le classement à la synchro
// automatique du lundi") : cette route lisait jusqu'ici le classement EN
// DIRECT depuis le serveur Vercel (fetchFfbbTeamRanking) -- systématiquement
// bloqué par la FFBB (BunnyCDN Shield, IP de datacenter), l'échec était
// avalé côté client (calendar-view.tsx) et affichait à tort "pas encore
// publié par la FFBB" au lieu du vrai problème. Lit désormais team_rankings,
// un instantané écrit UNIQUEMENT par scripts/sync-ffbb-all.ts (tâche
// planifiée locale, IP résidentielle) -- aucun appel FFBB ici, juste une
// lecture base déjà protégée par RLS ("select team_rankings club wide").
export async function GET(request: Request) {
  const teamId = new URL(request.url).searchParams.get("teamId");
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

  // Retour de Cindy du 29/10 ("je veux du propre") : UNE SEULE requête,
  // pas deux -- team_rankings est lu ici via une jointure imbriquée sur
  // teams (team_rankings.team_id -> teams.id, déjà une vraie FK) plutôt
  // que par un second aller-retour séparé pour ffbb_url_phase2. hasPhase2
  // reste nécessaire : team_rankings peut très bien ne pas avoir encore de
  // ligne de phase 2 (FFBB qui n'a pas publié) alors que ffbb_url_phase2
  // est déjà rempli -- sans cet indicateur, l'onglet Phase 2 resterait
  // invisible tant qu'aucun classement n'existe, et réapparaîtrait en
  // silence seulement après la prochaine synchro.
  const { data: teamRow, error } = await supabase
    .from("teams")
    .select(
      "ffbb_url_phase2, team_rankings(position, label, points, previous_ranking, is_own_team, logo, ffbb_phase)"
    )
    .eq("id", teamId)
    .order("sort_order", { foreignTable: "team_rankings", ascending: true })
    .maybeSingle();

  if (error) {
    console.error(`[ffbb-ranking] lecture échouée (team ${teamId}):`, error);
    return NextResponse.json({ error: "Impossible de récupérer le classement." }, { status: 500 });
  }

  const data = teamRow?.team_rankings ?? [];
  const toEntry = (r: (typeof data)[number]) => ({
    position: r.position,
    label: r.label,
    points: r.points,
    previousRanking: r.previous_ranking,
    isOwnTeam: r.is_own_team,
    logo: r.logo,
  });

  // Retour de Cindy du 28/10 ("onglet Phase 1 / Phase 2") : réparties ici,
  // dans cette même requête déjà là -- jamais un second aller-retour côté
  // client pour la phase 2. NULL (toutes les lignes importées avant ce
  // chantier) veut dire "phase 1", voir la migration ffbb_phase2.
  const ranking = data.filter((r) => normalizeFfbbPhase(r.ffbb_phase) === FFBB_PHASE_1).map(toEntry);
  const ranking2 = data.filter((r) => normalizeFfbbPhase(r.ffbb_phase) === FFBB_PHASE_2).map(toEntry);
  const hasPhase2 = Boolean(teamRow?.ffbb_url_phase2);

  return NextResponse.json({ ranking, ranking2, hasPhase2 });
}
