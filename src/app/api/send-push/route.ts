import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";

// Envoi côté serveur : la clé privée VAPID ne doit jamais atteindre le
// navigateur. Le ciblage passe par push_targets_for_event, qui vérifie
// elle-même que l'appelant encadre bien l'équipe concernée — la route ne
// décide donc pas seule qui a le droit d'envoyer.
export async function POST(request: Request) {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json(
      { error: "Clés VAPID absentes de l'environnement." },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  }

  const { eventId, title, body, url } = (await request.json()) as {
    eventId?: string;
    title?: string;
    body?: string;
    url?: string;
  };
  if (!eventId) {
    return NextResponse.json({ error: "eventId manquant." }, { status: 400 });
  }

  const { data: targets, error } = await supabase.rpc("push_targets_for_event", {
    p_event_id: eventId,
  });
  if (error) {
    return NextResponse.json({ error: "eventId invalide ou non autorisé." }, { status: 400 });
  }

  // Historique en base pour la cloche in-app : indépendant du succès de
  // l'envoi push (best-effort, jamais bloquant) — un parent qui ouvre son
  // espace plus tard doit retrouver l'alerte même s'il n'était abonné à
  // rien au moment de l'envoi.
  try {
    const { data: eventRow } = await supabase.from("events").select("team_id").eq("id", eventId).maybeSingle();
    await supabase.from("notifications").insert({
      team_id: eventRow?.team_id ?? null,
      event_id: eventId,
      title: title ?? "UBAC",
      body: body ?? "Le coach attend ta réponse.",
      url: url ?? "/dashboard",
    });
  } catch {
    // Silencieux : voir la note plus haut sur les échecs non bloquants.
  }

  const subscriptions = (targets ?? []) as {
    endpoint: string;
    p256dh: string;
    auth: string;
  }[];
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, failed: 0 });
  }

  webpush.setVapidDetails("mailto:contact@ubac17.fr", publicKey, privateKey);

  const payload = JSON.stringify({
    title: title ?? "UBAC",
    body: body ?? "Le coach attend ta réponse.",
    url: url ?? "/dashboard",
    tag: `event-${eventId}`,
  });

  // Un abonnement expiré (410) ou inconnu (404) est banal : un parent a
  // changé de téléphone ou vidé son navigateur. Ça ne doit pas faire
  // échouer l'envoi aux autres.
  const results = await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ sent, failed: results.length - sent });
}
