import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChildEvent } from "@/app/enfant/view/child-dashboard";

// Retour de Cindy du 12/09 ("Matchs officiels du club", puis "il faut que
// tout espace qui ne soit pas bureau puisse avoir ce petit oeil") : Espace
// Enfant, Commissions & Administration et Bénévoles tournent tous avec
// service_role (pas d'auth.uid(), voir le commentaire en tête de
// enfant/view/page.tsx) -- jamais de requête client-side possible ici,
// contrairement à Bureau/Coach/Famille (calendar-view.tsx, vrai compte
// Supabase Auth) qui chargent ces mêmes matchs à la demande, au clic sur
// l'œil. Ces trois espaces-ci reçoivent donc la liste déjà prête, calculée
// une fois par chargement de page -- coût négligeable (quelques colonnes,
// season glissante de 6 mois) au regard de la simplicité gagnée. Un seul
// et même mapping vers ChildEvent, jamais dupliqué entre les trois pages
// appelantes (enfant/view/page.tsx, read-only-briques-data.ts pour
// Commission + Bénévole).
export async function getClubOfficialMatches(supabase: SupabaseClient): Promise<ChildEvent[]> {
  const windowStart = new Date(Date.now() - 183 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, event_type, is_home, location, salle, start_time, end_time, impact_time, team_id, team_score, opponent_score, teams(name)"
    )
    .eq("event_type", "MATCH")
    .gte("start_time", windowStart)
    .order("start_time", { ascending: true });
  if (error) {
    console.error("[getClubOfficialMatches] échec:", error);
    return [];
  }
  return (data ?? []).map((e) => {
    const team = e.teams as unknown as { name: string | null } | null;
    return {
      id: e.id,
      title: e.title,
      eventType: e.event_type,
      isHome: e.is_home,
      location: e.location,
      salle: e.salle,
      startTime: e.start_time,
      endTime: e.end_time,
      impactTime: e.impact_time,
      teamId: e.team_id,
      // Toujours un match d'UNE équipe précise (jamais "équipes ciblées") :
      // targetTeamIds n'a de sens que pour un événement club, pas un match
      // officiel.
      targetTeamIds: null,
      teamName: team?.name ?? null,
      teamScore: e.team_score,
      opponentScore: e.opponent_score,
      // Jamais payant (retour de Cindy du 2026-08-25, badge "Payant"
      // seulement côté Enfant/lecture seule) : un match officiel n'est
      // jamais l'événement payant en question.
      isPaid: false,
    };
  });
}
