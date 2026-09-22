import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatPersonName } from "@/lib/names";
import { runBatched, Semaphore } from "@/lib/batch";
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

  // Retour de Cindy du 21/09 ("je pense que les requêtes peuvent être
  // améliorées ici aussi") : les 4 appels ci-dessous n'étaient bornés que
  // par leur repli interne (Semaphore(4) chacun, jamais partagé), sans
  // rapport avec le Semaphore(9) de page.tsx -- cette route, appelée à
  // chaque changement d'événements affichés (pas qu'au chargement initial),
  // pouvait donc ajouter jusqu'à 16 requêtes en vol en plus du reste de la
  // page. Même plafond partagé ici. Chacun des 4 appels redemandait aussi
  // sa propre traduction club_member_names/club_benevole_names (même noms,
  // même club) -- résolue une seule fois ici et partagée, même correctif
  // que page.tsx (voir clubDirectoryPromise).
  const dbLimit = new Semaphore(9);
  const [{ data: memberRows }, { data: benevoleRows }] = await runBatched(
    [
      () => supabase.from("club_member_names").select("id, first_name, last_name"),
      () => supabase.from("club_benevole_names").select("id, first_name, last_name"),
    ],
    dbLimit
  );
  const nameByPlayerId = new Map<string, string>();
  (memberRows ?? []).forEach((row) => {
    nameByPlayerId.set(row.id as string, formatPersonName(row.first_name, row.last_name));
  });
  const nameByBenevoleId = new Map<string, string>();
  (benevoleRows ?? []).forEach((row) => {
    nameByBenevoleId.set(row.id as string, formatPersonName(row.first_name, row.last_name));
  });

  const [tasksByEventId, carpoolByEventId, volunteerNeedsByEventId, matchOfficialRolesByEventId] =
    await Promise.all([
      getEventTasksByEventId(supabase, eventIds, dbLimit, nameByPlayerId),
      getCarpoolOffersByEventId(supabase, eventIds, dbLimit, nameByPlayerId),
      getVolunteerNeedsByEventId(supabase, eventIds, dbLimit, nameByPlayerId, nameByBenevoleId),
      getMatchOfficialRolesByEventId(supabase, eventIds, dbLimit, nameByPlayerId),
    ]);

  return NextResponse.json({
    tasksByEventId,
    carpoolByEventId,
    volunteerNeedsByEventId,
    matchOfficialRolesByEventId,
  });
}
