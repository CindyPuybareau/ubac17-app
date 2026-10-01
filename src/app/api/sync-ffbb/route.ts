import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncFfbbMatchesForTeam } from "@/lib/ffbb-sync";

// Retour de Cindy du 15/09 ("ça tourne dans le vide") : le fetch vers la
// FFBB a désormais sa propre limite de 20s (voir ffbb.ts), mais sans
// budget explicite ici, Vercel pouvait couper cette fonction avant ce
// délai (limite par défaut de la plateforme) -- la coupure brutale d'une
// fonction ne renvoie pas toujours une réponse propre au client, qui
// continuait alors d'attendre. 30s laisse une marge confortable au-delà
// du timeout interne de fetchFfbbTeamCalendar.
export const maxDuration = 30;
// Essai du 30/09 (Edge Runtime, dans l'espoir d'un réseau de sortie non
// filtré par BunnyCDN) retiré le 01/10 : confirmé sans effet en
// production (toujours 403), et des relais tiers indépendants de Vercel
// (allorigins.win, corsproxy.io, r.jina.ai -- hébergés sur Cloudflare
// Workers/Google Cloud) sont TOUS bloqués de la même façon -- la
// protection FFBB (BunnyCDN Shield) filtre une plage bien plus large que
// la seule infrastructure Vercel, probablement tout le "cloud/datacenter"
// en bloc. Edge Runtime n'apportait donc rien, juste de la complexité en
// plus (comportement différent de maxDuration, API Node indisponibles).
// Retour de Cindy du 01/10 ("comment je synchroniserais ?") : ce bouton
// reste donc cassé en production tant qu'on clique depuis le site en
// ligne -- voir scripts/sync-ffbb-all.ts pour la synchro automatique
// depuis une IP résidentielle (tâche planifiée locale), qui écrit dans la
// même base via la même logique (ffbb-sync.ts, partagée).

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

  // Logique de lecture/écriture extraite dans ffbb-sync.ts (retour de
  // Cindy du 01/10, "comment je synchroniserais ?") -- partagée avec
  // scripts/sync-ffbb-all.ts (tâche planifiée locale, IP résidentielle),
  // pour n'avoir qu'UNE seule logique de correspondance/anti-doublon, peu
  // importe le client Supabase utilisé (session utilisateur ici,
  // service_role côté script).
  const result = await syncFfbbMatchesForTeam(supabase, teamId, team.ffbb_url);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    imported: result.imported,
    updated: result.updated,
    skipped: result.skipped,
    ...(result.message ? { message: result.message } : {}),
  });
}
