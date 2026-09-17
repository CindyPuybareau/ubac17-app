import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveTeamPushSubscriptions, sendWebPush } from "@/lib/push-targets";
import { volunteerRoleLabel } from "@/app/dashboard/event-volunteer-needs";

// Seule écriture ouverte au lien public d'une commission (retour de Cindy
// du 10/09, "Accès Commissions &
// Administration") : pas de session/cookie ici, le jeton de la commission
// est envoyé directement à chaque appel (comme la page elle-même,
// /commission/[token] — aucune connexion requise, le lien EST la preuve
// d'accès) et un prénom saisi au moment de se proposer plutôt qu'une
// identité permanente (choix de Cindy : le lien est partagé par toute une
// commission, pas propre à une personne). Jamais de "se désinscrire" ici
// -- un·e invité·e anonyme ne peut annuler que via le Bureau/Coach côté
// admin, cohérent avec l'absence d'identité vérifiable.
export async function POST(request: Request) {
  let body: { token?: string; needId?: string; guestName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const token = body.token?.trim();
  const needId = body.needId;
  const guestName = body.guestName?.trim();
  if (!token || !needId || !guestName) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const { data: group } = await supabase
    .from("whatsapp_groups")
    .select("id")
    .eq("access_token", token)
    .eq("category", "COMMISSION")
    .maybeSingle();
  if (!group) {
    return NextResponse.json({ error: "Lien invalide." }, { status: 401 });
  }

  // Le besoin doit appartenir à un événement réellement rattaché à CETTE
  // commission (retour de Cindy du 10/09 : un seul choix pour l'événement
  // entier, plus par besoin) -- jamais se fier à ce qu'envoie le client seul.
  const { data: needRow } = await supabase
    .from("event_volunteer_needs")
    .select(
      "id, role_code, custom_label, events(id, title, start_time, commission_group_ids, team_id, target_team_ids)"
    )
    .eq("id", needId)
    .maybeSingle();
  const needEvent = needRow?.events as unknown as {
    id: string;
    title: string | null;
    start_time: string;
    commission_group_ids: string[];
    team_id: string | null;
    target_team_ids: string[] | null;
  } | null;
  if (!needRow || !needEvent || !needEvent.commission_group_ids.includes(group.id)) {
    return NextResponse.json({ error: "Besoin introuvable pour cette commission." }, { status: 404 });
  }
  const eventStartTime = needEvent.start_time;
  if (eventStartTime && new Date(eventStartTime).getTime() < Date.now()) {
    return NextResponse.json({ error: "Cet événement est déjà passé." }, { status: 400 });
  }

  const { error } = await supabase.from("event_volunteer_signups").insert({
    need_id: needId,
    commission_group_id: group.id,
    guest_name: guestName,
    source: "VOLUNTEER",
  });
  if (error) {
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "Ce prénom est déjà inscrit sur ce besoin."
            : error.message.includes("complet")
              ? "Ce créneau est déjà complet."
              : `Inscription impossible : ${error.message}`,
      },
      { status: 400 }
    );
  }

  // Retour de Cindy du 17/09 ("je veux des push réels pour...", inscription
  // via un lien commission) : coachesOnly -- qui gère l'événement veut
  // savoir qu'un bénévole vient de se proposer, jamais les familles.
  // Best-effort, jamais bloquant : l'inscription elle-même est déjà
  // confirmée juste au-dessus.
  try {
    const roleLabel = volunteerRoleLabel(needRow.role_code, needRow.custom_label);
    const title = "Bénévole inscrit";
    const body = `${guestName} se propose pour : ${roleLabel} — ${needEvent.title ?? "un événement"}.`;
    await supabase.from("notifications").insert({
      team_id: needEvent.team_id,
      target_team_ids: needEvent.target_team_ids,
      event_id: needEvent.id,
      title,
      body,
      url: "/dashboard",
    });
    const targets = await resolveTeamPushSubscriptions(supabase, {
      teamId: needEvent.team_id,
      targetTeamIds: needEvent.target_team_ids,
      coachesOnly: true,
    });
    await sendWebPush(targets, { title, body, url: "/dashboard" });
  } catch (e) {
    console.error("[commission-signup] notification bénévole échouée:", e);
  }

  return NextResponse.json({ ok: true });
}
