import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { BENEVOLE_SESSION_COOKIE, verifyBenevoleSession } from "@/lib/benevole-session";
import { getVolunteerNeedsByEventId, type VolunteerNeed } from "@/app/dashboard/event-volunteer-needs";
import { getReadOnlyBriquesData } from "@/lib/read-only-briques-data";
import BenevoleView, { type BenevoleEvent } from "./benevole-view";
import type { BenevoleNotification } from "./benevole-notification-bell";

// Toute la lecture de données vit ici, côté serveur, avec service_role
// (un bénévole n'a pas d'auth.uid(), même principe que /enfant/view/page.tsx
// — voir ce fichier pour le détail du raisonnement). BenevoleView ne reçoit
// que des props déjà calculées, en lecture seule — la seule écriture
// possible (s'inscrire/se désinscrire d'un besoin) passe par
// /api/benevole-signup, jamais par un appel Supabase direct depuis le
// navigateur.
//
// Retour de Cindy du 05/09 ("profil et bénévoles doivent être fusionnés") :
// en plus de ce qui précède, un bénévole peut avoir un access_profile_id
// (voir 20261031150000_benevoles_access_profile.sql) qui lui ouvre en
// lecture seule les mêmes briques qu'un compte Bureau restreint (voir
// admin-view.tsx, étape 3 des profils d'accès sur-mesure) -- profile-
// sections.tsx s'occupe de l'affichage, ce fichier ne fait que réunir les
// données correspondant aux briques cochées, jamais plus.
export default async function BenevoleViewPage() {
  const cookieStore = await cookies();
  const benevoleId = verifyBenevoleSession(cookieStore.get(BENEVOLE_SESSION_COOKIE)?.value);

  if (!benevoleId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Ta session a expiré. Redemande le lien au Bureau du club pour te reconnecter.
        </p>
      </div>
    );
  }

  const supabase = createServiceClient();

  const { data: benevole } = await supabase
    .from("benevoles")
    .select("id, first_name, archived_at, access_profile_id, notifications_enabled")
    .eq("id", benevoleId)
    .maybeSingle();

  if (!benevole || benevole.archived_at) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16 text-center">
        <p className="text-sm text-zinc-500">
          Ce lien n&apos;est plus valide. Contacte le Bureau du club.
        </p>
      </div>
    );
  }

  const { data: inviteRows } = await supabase
    .from("event_benevole_invites")
    .select("event_id, status")
    .eq("benevole_id", benevoleId);
  const eventIds = (inviteRows ?? []).map((r) => r.event_id as string);
  // Retour de Cindy du 06/09 ("le bénévole doit pouvoir se mettre présent
  // ou non") : sa réponse à CETTE invitation précise -- voir
  // /api/benevole-rsvp pour l'écriture.
  const statusByEventId = new Map(
    (inviteRows ?? []).map((r) => [r.event_id as string, r.status as "PENDING" | "PRESENT" | "ABSENT"])
  );

  let events: BenevoleEvent[] = [];
  let volunteerNeedsByEventId: Record<string, VolunteerNeed[]> = {};

  if (eventIds.length > 0) {
    // Retour d'audit du 28/08 : sans filtre de date, un bénévole invité en
    // octobre qui ouvre son lien en mars retombait d'abord sur ces
    // rendez-vous passés (tri chronologique croissant, sans borne basse),
    // avec des boutons "Je m'en occupe" actifs pour des besoins qui n'ont
    // plus lieu d'être. Cette page n'a aucun historique à montrer (voir
    // benevole-view.tsx) : ne garder que ce qui reste à venir.
    const { data: eventRows } = await supabase
      .from("events")
      .select(
        "id, title, event_type, location, salle, start_time, end_time, teams(name)"
      )
      .in("id", eventIds)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    events = (eventRows ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      eventType: e.event_type,
      location: e.location,
      salle: e.salle,
      startTime: e.start_time,
      endTime: e.end_time,
      teamName: (e.teams as unknown as { name: string | null } | null)?.name ?? null,
      status: statusByEventId.get(e.id) ?? "PENDING",
    }));

    volunteerNeedsByEventId = await getVolunteerNeedsByEventId(supabase, eventIds);
  }

  // Profil d'accès sur-mesure (étape "bénévoles" du 05/09) : null/aucune
  // ligne -> allowedBriques reste vide, aucune donnée supplémentaire n'est
  // chargée ni affichée -- comportement strictement identique à avant
  // cette fonctionnalité.
  let allowedBriques: string[] = [];
  if (benevole.access_profile_id) {
    const { data: briquesData } = await supabase
      .from("access_profile_briques")
      .select("brique")
      .eq("profile_id", benevole.access_profile_id);
    allowedBriques = (briquesData ?? []).map((b) => b.brique);
  }

  // Retour de Cindy du 06/09 ("je ne vois pas dans Vie du club son groupe
  // WhatsApp") : pas une brique -- c'est une information sur LUI (à quel
  // groupe il a été rattaché, voir benevoles-manager.tsx), pas un droit
  // d'accès, donc toujours chargée, jamais conditionnée par
  // allowedBriques.
  const { data: myGroupsData } = await supabase
    .from("benevole_whatsapp_groups")
    .select("whatsapp_groups(id, name, invite_link)")
    .eq("benevole_id", benevoleId);
  const myWhatsappGroups = (
    (myGroupsData ?? []) as unknown as {
      whatsapp_groups: { id: string; name: string; invite_link: string | null } | null;
    }[]
  )
    .map((row) => row.whatsapp_groups)
    .filter((g): g is { id: string; name: string; invite_link: string | null } => Boolean(g))
    .map((g) => ({ id: g.id, name: g.name, inviteLink: g.invite_link }));

  const {
    profileTeams,
    profileMembers,
    profileEvents,
    profileSponsors,
    profileClubReports,
    attendanceByEventId,
  } = await getReadOnlyBriquesData(supabase, allowedBriques);

  // Cloche de notifications (retour de Cindy du 06/09, "comme pour tous
  // les autres espaces") : mêmes alertes que Parent/Coach/Enfant (voir la
  // migration 20261031220000_benevole_notifications.sql), lues ici en
  // service_role et filtrées directement sur benevole_id -- un bénévole
  // est notifié individuellement (son invitation à un événement précis),
  // jamais par équipe, donc pas de filtre à recalculer comme côté enfant.
  const notificationsEnabled = benevole.notifications_enabled ?? true;
  let notifications: BenevoleNotification[] = [];
  if (notificationsEnabled) {
    const { data: notifRows } = await supabase
      .from("notifications")
      .select("id, title, body, created_at")
      .eq("benevole_id", benevoleId)
      .order("created_at", { ascending: false })
      .limit(30);
    const notifIds = (notifRows ?? []).map((n) => n.id);
    const { data: readRows } =
      notifIds.length > 0
        ? await supabase
            .from("notification_reads")
            .select("notification_id, read_at")
            .eq("benevole_id", benevoleId)
            .in("notification_id", notifIds)
        : { data: [] as { notification_id: string; read_at: string }[] };
    const readAtByNotifId = new Map((readRows ?? []).map((r) => [r.notification_id, r.read_at]));
    notifications = (notifRows ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      createdAt: n.created_at,
      readAt: readAtByNotifId.get(n.id) ?? null,
    }));
  }

  return (
    <BenevoleView
      firstName={benevole.first_name}
      benevoleId={benevoleId}
      events={events}
      volunteerNeedsByEventId={volunteerNeedsByEventId}
      allowedBriques={allowedBriques}
      profileTeams={profileTeams}
      profileMembers={profileMembers}
      profileEvents={profileEvents}
      profileSponsors={profileSponsors}
      profileClubReports={profileClubReports}
      attendanceByEventId={attendanceByEventId}
      myWhatsappGroups={myWhatsappGroups}
      notifications={notifications}
      notificationsEnabled={notificationsEnabled}
    />
  );
}
