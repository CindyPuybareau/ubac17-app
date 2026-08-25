import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { BENEVOLE_SESSION_COOKIE, verifyBenevoleSession } from "@/lib/benevole-session";
import { getVolunteerNeedsByEventId, type VolunteerNeed } from "@/app/dashboard/event-volunteer-needs";
import { formatFirstName } from "@/lib/names";
import BenevoleView, { type BenevoleEvent } from "./benevole-view";

// Toute la lecture de données vit ici, côté serveur, avec service_role
// (un bénévole n'a pas d'auth.uid(), même principe que /enfant/view/page.tsx
// — voir ce fichier pour le détail du raisonnement). BenevoleView ne reçoit
// que des props déjà calculées, en lecture seule — la seule écriture
// possible (s'inscrire/se désinscrire d'un besoin) passe par
// /api/benevole-signup, jamais par un appel Supabase direct depuis le
// navigateur.
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
    .select("id, first_name, archived_at")
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
    .select("event_id")
    .eq("benevole_id", benevoleId);
  const eventIds = (inviteRows ?? []).map((r) => r.event_id as string);

  let events: BenevoleEvent[] = [];
  let volunteerNeedsByEventId: Record<string, VolunteerNeed[]> = {};

  if (eventIds.length > 0) {
    const { data: eventRows } = await supabase
      .from("events")
      .select(
        "id, title, event_type, location, salle, start_time, end_time, teams(name)"
      )
      .in("id", eventIds)
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
    }));

    volunteerNeedsByEventId = await getVolunteerNeedsByEventId(supabase, eventIds);
  }

  return (
    <BenevoleView
      firstName={benevole.first_name}
      benevoleId={benevoleId}
      events={events}
      volunteerNeedsByEventId={volunteerNeedsByEventId}
    />
  );
}
