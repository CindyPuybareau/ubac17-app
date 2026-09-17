import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  resolveBureauPushSubscriptions,
  resolvePlayerPushSubscriptions,
  resolveTeamPushSubscriptions,
  sendWebPush,
} from "@/lib/push-targets";

// Retour de Cindy du 17/09 ("je veux des push réels pour...") : pendant
// jusqu'ici de /api/send-push (réservée à un event_id + push_targets_for_event,
// qui exclut "déjà répondu présent/absent" -- sans rapport avec les
// notifications visées ici : besoin bénévole, nouveau joueur...). Le
// ciblage passe par le client service_role (bypass RLS), pas par une
// fonction SQL avec vérification d'autorisation intégrée comme
// push_targets_for_event : contrairement à ce cas-là, l'appelant n'est pas
// forcément Coach/Bureau (un parent qui se porte volontaire pour un
// maillot doit pouvoir notifier LE COACH, sans être coach lui-même) --
// seule condition ici : être connecté (même garde minimale que
// /api/send-push), le rôle précis n'a pas d'importance pour ce geste.
export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: "Clés VAPID absentes de l'environnement." }, { status: 500 });
  }

  const authedSupabase = await createClient();
  const {
    data: { user },
  } = await authedSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const {
    audience,
    teamId,
    targetTeamIds,
    coachesOnly,
    playerId,
    title,
    body,
    url,
  } = (await request.json()) as {
    audience?: "TEAM" | "BUREAU" | "PLAYER";
    teamId?: string | null;
    targetTeamIds?: string[] | null;
    coachesOnly?: boolean;
    playerId?: string;
    title?: string;
    body?: string;
    url?: string;
  };

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const targets =
    audience === "BUREAU"
      ? await resolveBureauPushSubscriptions(supabase)
      : audience === "PLAYER"
        ? playerId
          ? await resolvePlayerPushSubscriptions(supabase, playerId)
          : []
        : await resolveTeamPushSubscriptions(supabase, {
            teamId: teamId ?? null,
            targetTeamIds: targetTeamIds ?? null,
            coachesOnly: Boolean(coachesOnly),
          });

  const { sent, failed } = await sendWebPush(targets, {
    title: title ?? "UBAC",
    body: body ?? "",
    url: url ?? "/dashboard",
  });

  return NextResponse.json({ sent, failed });
}
