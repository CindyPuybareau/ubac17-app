import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { CHILD_SESSION_COOKIE, verifyChildSession } from "@/lib/child-session";

// Interrupteur "recevoir les notifications" côté enfant (players.notifications_enabled,
// voir la migration 20260817000000_notifications.sql) — une seule colonne
// booléenne sur SA PROPRE fiche, rien d'autre n'est jamais accessible en
// écriture depuis cette route.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const playerId = verifyChildSession(cookieStore.get(CHILD_SESSION_COOKIE)?.value);
  if (!playerId) {
    return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  }

  let body: { enabled?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("players")
    .update({ notifications_enabled: body.enabled })
    .eq("id", playerId);

  if (error) {
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
