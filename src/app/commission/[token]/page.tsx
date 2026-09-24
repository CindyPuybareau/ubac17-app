import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { getVolunteerNeedsByEventId, type VolunteerNeed } from "@/app/dashboard/event-volunteer-needs";
import { getReadOnlyBriquesData } from "@/lib/read-only-briques-data";
import { commissionMeta } from "@/lib/commission-labels";
import CommissionView, { type CommissionEvent } from "./commission-view";
import type { CommissionNotification } from "./commission-notification-bell";

// Point d'entrée du lien public et permanent d'une commission (retour de
// Cindy du 10/09, "Accès Commissions & Administration") : contrairement à
// /benevole/[token] (une redirection qui pose un cookie de session), ce
// lien est PARTAGÉ par toute une commission, sans identité individuelle à
// mémoriser -- une simple page côté serveur qui relit le jeton à chaque
// visite, aucune connexion requise. whatsapp_groups.access_token EST la
// preuve d'accès, comme benevoles.access_token pour un bénévole individuel
// (voir /benevole/[token]/route.ts).
export default async function CommissionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    redirect("/commission/erreur");
  }

  const { data: group } = await supabase
    .from("whatsapp_groups")
    .select("id, name, access_profile_id")
    .eq("access_token", token)
    .eq("category", "COMMISSION")
    .maybeSingle();

  if (!group) {
    redirect("/commission/erreur");
  }

  const { label: commissionLabel } = commissionMeta(group.name);

  let allowedBriques: string[] = [];
  if (group.access_profile_id) {
    const { data: briquesData } = await supabase
      .from("access_profile_briques")
      .select("brique")
      .eq("profile_id", group.access_profile_id);
    allowedBriques = (briquesData ?? []).map((b) => b.brique);
  }

  const {
    profileTeams,
    profileTeamRefs,
    profileMembers,
    profileEvents,
    profileSponsors,
    profileClubReports,
    attendanceByEventId,
    profileDashboardCounts,
    profileWhatsappGroups,
  } = await getReadOnlyBriquesData(supabase, allowedBriques);

  // Événements concernant CETTE commission (retour de Cindy du 10/09,
  // "un seul choix pour l'événement entier... les groupes commissions
  // concernés seront informés de TOUS les besoins créés") -- le
  // rattachement se fait maintenant sur l'événement (events.
  // commission_group_ids), plus par besoin individuellement : TOUS les
  // besoins d'un événement rattaché à cette commission lui sont montrés.
  const { data: eventRows } = await supabase
    .from("events")
    .select("id, title, event_type, location, salle, start_time, end_time, teams(name)")
    .contains("commission_group_ids", [group.id])
    .gte("start_time", new Date().toISOString())
    .order("start_time", { ascending: true });

  const events: CommissionEvent[] = (eventRows ?? []).map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.event_type,
    location: e.location,
    salle: e.salle,
    startTime: e.start_time,
    endTime: e.end_time,
    teamName: (e.teams as unknown as { name: string | null } | null)?.name ?? null,
  }));

  const eventIds = events.map((e) => e.id);
  const volunteerNeedsByEventId: Record<string, VolunteerNeed[]> =
    eventIds.length > 0 ? await getVolunteerNeedsByEventId(supabase, eventIds) : {};

  // Cloche de la commission (retour de Cindy du 13/09) : lues en
  // service_role comme le reste de cette page, jamais via notifications_
  // for_me()/auth.uid() -- ce lien n'a pas de session. 60 jours de recul
  // (plus large que les 14 jours du reste de l'appli, voir notifications_
  // for_me() : un besoin non urgent peut rester d'actualité plus longtemps
  // pour une commission qui n'ouvre son lien que ponctuellement).
  // Composant serveur (pas un hook), exécuté une fois par requête réelle :
  // lire l'heure courante ici est le comportement voulu, pas un effet de
  // bord à masquer (même exception que page.tsx, eventsWindowStart).
  const sixtyDaysAgo = new Date(
    // eslint-disable-next-line react-hooks/purity -- voir commentaire au-dessus
    Date.now() - 60 * 24 * 60 * 60 * 1000
  ).toISOString();
  const { data: notificationRows } = await supabase
    .from("notifications")
    .select("id, title, body, created_at")
    .eq("commission_group_id", group.id)
    .gte("created_at", sixtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(30);
  const notifications: CommissionNotification[] = (notificationRows ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    createdAt: n.created_at,
  }));

  return (
    <CommissionView
      token={token}
      groupId={group.id}
      commissionLabel={commissionLabel}
      events={events}
      volunteerNeedsByEventId={volunteerNeedsByEventId}
      notifications={notifications}
      allowedBriques={allowedBriques}
      profileTeams={profileTeams}
      profileTeamRefs={profileTeamRefs}
      profileMembers={profileMembers}
      profileEvents={profileEvents}
      profileSponsors={profileSponsors}
      profileClubReports={profileClubReports}
      attendanceByEventId={attendanceByEventId}
      profileDashboardCounts={profileDashboardCounts}
      profileWhatsappGroups={profileWhatsappGroups}
    />
  );
}
