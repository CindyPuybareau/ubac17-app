import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveTeamPushSubscriptions, sendWebPush } from "@/lib/push-targets";

// Retour de Cindy du 25/09 ("les bénévoles doivent pouvoir cliquer sur
// présent ou absent... quand la commission est sélectionnée, plus de
// lecture seule") : même principe que /api/commission-signup -- pas de
// session/cookie, le jeton de la commission est envoyé à chaque appel (le
// lien EST la preuve d'accès), un nom tapé au moment de répondre plutôt
// qu'une identité permanente (lien partagé par toute une commission).
// Réservé aux événements où CETTE commission est explicitement concernée
// (events.commission_group_ids) -- jamais un événement d'équipe ou club
// entier non ciblé sur elle, quoi que le client prétende. Jamais un upsert
// PAR NOM (un·e bénévole invité·e n'a pas d'identité stable à retrouver
// d'une visite à l'autre -- deux personnes pourraient partager un nom).
//
// Retour de Cindy du 25/09 (suite, "je ne peux plus me noter absent une
// fois confirmé présent") : `rsvpId` optionnel -- REND possible de changer
// sa réponse SANS ressaisir son nom, mais seulement la ligne que CETTE même
// carte vient de créer (id renvoyé à la première réponse, gardé en
// mémoire côté client le temps de la visite) -- une mise à jour ciblée par
// id, jamais un upsert par nom qui risquerait d'écraser la réponse d'un
// homonyme.
export async function POST(request: Request) {
  let body: { token?: string; eventId?: string; guestName?: string; status?: string; rsvpId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const token = body.token?.trim();
  const eventId = body.eventId;
  const guestName = body.guestName?.trim();
  const status = body.status;
  const rsvpId = body.rsvpId?.trim() || null;
  if (!token || !eventId || !guestName || (status !== "PRESENT" && status !== "ABSENT")) {
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

  // L'événement doit réellement concerner CETTE commission -- jamais se
  // fier à ce qu'envoie le client seul (même garde que commission-signup
  // pour un besoin bénévole).
  const { data: event } = await supabase
    .from("events")
    .select("id, title, start_time, commission_group_ids, team_id, target_team_ids")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || !(event.commission_group_ids ?? []).includes(group.id)) {
    return NextResponse.json({ error: "Événement introuvable pour cette commission." }, { status: 404 });
  }
  if (event.start_time && new Date(event.start_time).getTime() < Date.now()) {
    return NextResponse.json({ error: "Cet événement est déjà passé." }, { status: 400 });
  }

  let newRsvpId: string;
  if (rsvpId) {
    // Ne met à jour que la ligne déjà rattachée à CET événement et créée
    // comme invité (guest_name non nul) -- jamais une ligne d'un vrai
    // membre, même si un id y ressemblait.
    const { data, error } = await supabase
      .from("rsvps")
      .update({ status })
      .eq("id", rsvpId)
      .eq("event_id", eventId)
      .not("guest_name", "is", null)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return NextResponse.json({ error: "Réponse introuvable, réessaie." }, { status: 404 });
    }
    newRsvpId = data.id;
  } else {
    const { data, error } = await supabase
      .from("rsvps")
      .insert({ event_id: eventId, guest_name: guestName, status })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: `Réponse impossible : ${error?.message}` }, { status: 400 });
    }
    newRsvpId = data.id;
  }

  // Best-effort, jamais bloquant : la réponse elle-même est déjà confirmée
  // juste au-dessus. coachesOnly -- qui gère l'événement veut savoir qu'un
  // bénévole a répondu, jamais les familles.
  try {
    const label = status === "PRESENT" ? "présent" : "absent";
    const title = "Réponse bénévole";
    const notifBody = `${guestName} a répondu ${label} à : ${event.title ?? "un événement"}.`;
    await supabase.from("notifications").insert({
      team_id: event.team_id,
      target_team_ids: event.target_team_ids,
      event_id: event.id,
      title,
      body: notifBody,
      url: "/dashboard",
    });
    const targets = await resolveTeamPushSubscriptions(supabase, {
      teamId: event.team_id,
      targetTeamIds: event.target_team_ids,
      coachesOnly: true,
    });
    await sendWebPush(targets, { title, body: notifBody, url: "/dashboard" });
  } catch (e) {
    console.error("[guest-rsvp] notification échouée:", e);
  }

  return NextResponse.json({ ok: true, rsvpId: newRsvpId });
}
