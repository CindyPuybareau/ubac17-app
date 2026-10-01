import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { data, error } = await supabase
    .from("team_rankings")
    .select("position, label, points, previous_ranking, is_own_team, logo")
    .eq("team_id", teamId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(`[ffbb-ranking] lecture échouée (team ${teamId}):`, error);
    return NextResponse.json({ error: "Impossible de récupérer le classement." }, { status: 500 });
  }

  return NextResponse.json({
    ranking: (data ?? []).map((r) => ({
      position: r.position,
      label: r.label,
      points: r.points,
      previousRanking: r.previous_ranking,
      isOwnTeam: r.is_own_team,
      logo: r.logo,
    })),
  });
}
