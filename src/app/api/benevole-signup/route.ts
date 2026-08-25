import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { BENEVOLE_SESSION_COOKIE, verifyBenevoleSession } from "@/lib/benevole-session";

// Seule écriture jamais accordée à une session bénévole (même principe que
// /api/child-avatar côté Espace Enfant) : s'inscrire ou se désinscrire
// d'UN besoin d'organisation précis, toujours sous SON PROPRE benevole_id
// (celui du cookie vérifié ici, jamais un id transmis par le client) —
// jamais d'accès direct à Supabase depuis le navigateur pour ce rôle.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const benevoleId = verifyBenevoleSession(cookieStore.get(BENEVOLE_SESSION_COOKIE)?.value);
  if (!benevoleId) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  let body: { needId?: string; action?: "join" | "leave" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { needId, action } = body;
  if (!needId || (action !== "join" && action !== "leave")) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Le bénévole ne doit voir/agir que sur un besoin d'un événement où il a
  // été explicitement invité — même garde-fou que la vérification faite
  // pour construire la liste affichée (benevole-view.tsx), refait ici
  // côté écriture pour ne jamais dépendre uniquement de ce que le client
  // envoie.
  const { data: needRow } = await supabase
    .from("event_volunteer_needs")
    .select("id, event_id")
    .eq("id", needId)
    .maybeSingle();
  if (!needRow) {
    return NextResponse.json({ error: "Besoin introuvable." }, { status: 404 });
  }
  const { data: inviteRow } = await supabase
    .from("event_benevole_invites")
    .select("event_id")
    .eq("event_id", needRow.event_id)
    .eq("benevole_id", benevoleId)
    .maybeSingle();
  if (!inviteRow) {
    return NextResponse.json({ error: "Non autorisé pour cet événement." }, { status: 403 });
  }

  if (action === "join") {
    const { error } = await supabase
      .from("event_volunteer_signups")
      .insert({ need_id: needId, benevole_id: benevoleId, source: "VOLUNTEER" });
    if (error) {
      return NextResponse.json(
        {
          error:
            error.code === "23505"
              ? "Tu es déjà inscrit(e) à ce besoin."
              : error.message.includes("complet")
                ? "Ce créneau est déjà complet."
                : `Inscription impossible : ${error.message}`,
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabase
    .from("event_volunteer_signups")
    .delete()
    .eq("need_id", needId)
    .eq("benevole_id", benevoleId);
  if (error) {
    return NextResponse.json({ error: "Désinscription impossible." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
