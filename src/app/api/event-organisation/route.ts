import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEventTasksByEventId, getCarpoolOffersByEventId } from "../../dashboard/event-tasks";
import { getVolunteerNeedsByEventId } from "../../dashboard/event-volunteer-needs";
import { getMatchOfficialRolesByEventId } from "../../dashboard/match-official-roles";

// Retour de Cindy du 16/09 (chantier Suspense, "afficher le contenu
// principal tout de suite, ces 3 données après coup") : jusqu'ici,
// tasks/carpool/besoins d'organisation étaient calculées côté serveur pour
// TOUS les événements affichés avant même de pouvoir montrer la première
// case du calendrier -- c'est justement ce calcul qui bloquait toute la
// page pendant les pics de charge partagée. calendar-view.tsx (pilote) les
// redemande maintenant lui-même, une fois la page déjà affichée, via cette
// route -- même fonctions, même client authentifié (donc mêmes règles RLS,
// mêmes données) que ce que page.tsx appelait avant, juste déplacées après
// le premier rendu au lieu d'avant.
export async function POST(request: Request) {
  const { eventIds } = await request.json();

  if (!Array.isArray(eventIds) || eventIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "eventIds (tableau de chaînes) requis." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const [tasksByEventId, carpoolByEventId, volunteerNeedsByEventId, matchOfficialRolesByEventId] = await Promise.all([
    getEventTasksByEventId(supabase, eventIds),
    getCarpoolOffersByEventId(supabase, eventIds),
    getVolunteerNeedsByEventId(supabase, eventIds),
    getMatchOfficialRolesByEventId(supabase, eventIds),
  ]);

  return NextResponse.json({
    tasksByEventId,
    carpoolByEventId,
    volunteerNeedsByEventId,
    matchOfficialRolesByEventId,
  });
}
