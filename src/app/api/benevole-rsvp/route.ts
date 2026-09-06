import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { BENEVOLE_SESSION_COOKIE, verifyBenevoleSession } from "@/lib/benevole-session";

// Retour de Cindy du 06/09 ("le bénévole doit pouvoir se mettre présent ou
// non") : distinct de /api/benevole-signup (qui rejoint/quitte UN besoin
// d'organisation précis) -- ici, une réponse générale de présence à
// l'événement pour lequel il a été invité, comme un joueur répond
// présent/absent. Même principe de sécurité : jamais d'accès direct à
// Supabase depuis le navigateur, toujours sous SON PROPRE benevole_id
// (celui du cookie vérifié ici, jamais un id transmis par le client).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const benevoleId = verifyBenevoleSession(cookieStore.get(BENEVOLE_SESSION_COOKIE)?.value);
  if (!benevoleId) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  let body: { eventId?: string; status?: "PRESENT" | "ABSENT" | "PENDING" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { eventId, status } = body;
  if (!eventId || (status !== "PRESENT" && status !== "ABSENT" && status !== "PENDING")) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Même garde qu'/api/benevole-signup : un bénévole retiré par le Bureau
  // ne doit pas garder ce droit tant que son cookie reste valide.
  const { data: benevoleRow } = await supabase
    .from("benevoles")
    .select("archived_at")
    .eq("id", benevoleId)
    .maybeSingle();
  if (!benevoleRow || benevoleRow.archived_at) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  // Ne répond que sur SA PROPRE invitation, jamais sur un event_id
  // arbitraire transmis par le client -- l'update ci-dessous ne touche de
  // toute façon que la ligne (event_id, benevole_id) correspondante, mais
  // ce garde-fou évite de laisser croire à un succès pour un événement où
  // il n'a jamais été invité.
  const { data: inviteRow } = await supabase
    .from("event_benevole_invites")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("benevole_id", benevoleId)
    .maybeSingle();
  if (!inviteRow) {
    return NextResponse.json({ error: "Non autorisé pour cet événement." }, { status: 403 });
  }

  const { error } = await supabase
    .from("event_benevole_invites")
    .update({ status })
    .eq("event_id", eventId)
    .eq("benevole_id", benevoleId);
  if (error) {
    return NextResponse.json({ error: `Réponse impossible : ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
