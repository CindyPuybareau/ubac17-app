import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { fetchFfbbTeamRanking } from "@/lib/ffbb";

// Même marge que sync-ffbb/route.ts (voir son commentaire) : le fetch
// FFBB a sa propre limite de 20s (ffbb.ts), 30s laisse de la place
// au-delà pour éviter une coupure brutale côté Vercel.
export const maxDuration = 30;

// Retour de Cindy du 21/09 ("le classement se recharge à chaque fois,
// être sûr que ça ne bouffe pas de requêtes") : chaque changement d'onglet
// Résultats/Matchs officiels relançait un aller-retour vers la FFBB (+ une
// lecture teams.ffbb_url) même en revenant sur une équipe déjà vue à
// l'instant. Le classement d'une équipe est identique pour tout le monde
// (donnée publique côté FFBB elle-même) et ne change pas d'une minute à
// l'autre -- même raisonnement que getEventRoleTypesCached (event-tasks.ts),
// même mise en cache 60s. Client service_role (pas celui de la requête en
// cours) nécessaire ici pour la même raison que là-bas : la valeur mise en
// cache doit être obtenue une fois, indépendamment de qui a déclenché le
// cache-miss -- jamais lié aux cookies de session d'un utilisateur précis.
const getFfbbRankingCached = unstable_cache(
  async (teamId: string) => {
    const supabase = createServiceClient();
    const { data: team } = await supabase
      .from("teams")
      .select("ffbb_url")
      .eq("id", teamId)
      .maybeSingle();
    if (!team?.ffbb_url) return [];
    return fetchFfbbTeamRanking(team.ffbb_url);
  },
  ["ffbb-ranking"],
  { revalidate: 60 }
);

// Lecture seule, publique sur le site FFBB lui-même -- pas de contrôle
// coach/admin comme sync-ffbb (qui écrit en base) : n'importe quel compte
// connecté voyant l'onglet Résultats d'une équipe peut demander son
// classement.
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

  try {
    const ranking = await getFfbbRankingCached(teamId);
    return NextResponse.json({ ranking });
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer le classement FFBB." },
      { status: 502 }
    );
  }
}
