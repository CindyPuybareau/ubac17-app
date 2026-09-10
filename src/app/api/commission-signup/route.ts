import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Écriture équivalente à /api/benevole-signup, mais pour le lien commun
// d'une commission (retour de Cindy du 10/09, "Accès Commissions &
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

  // Le besoin doit réellement concerner CETTE commission -- jamais se fier
  // à ce qu'envoie le client seul (même garde-fou que /api/benevole-signup
  // pour l'invitation à un événement).
  const { data: needRow } = await supabase
    .from("event_volunteer_needs")
    .select("id, commission_group_ids, events(start_time)")
    .eq("id", needId)
    .maybeSingle();
  if (!needRow || !(needRow.commission_group_ids as string[]).includes(group.id)) {
    return NextResponse.json({ error: "Besoin introuvable pour cette commission." }, { status: 404 });
  }
  const eventStartTime = (needRow.events as unknown as { start_time: string } | null)?.start_time;
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
  return NextResponse.json({ ok: true });
}
