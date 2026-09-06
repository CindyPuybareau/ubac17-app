import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { BENEVOLE_SESSION_COOKIE, verifyBenevoleSession } from "@/lib/benevole-session";

// Interrupteur "recevoir les notifications" côté bénévole
// (benevoles.notifications_enabled, voir la migration
// 20261031220000_benevole_notifications.sql) — même principe que côté
// enfant (players.notifications_enabled) : une seule colonne booléenne sur
// SA PROPRE fiche, rien d'autre n'est jamais accessible en écriture depuis
// cette route.
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const benevoleId = verifyBenevoleSession(cookieStore.get(BENEVOLE_SESSION_COOKIE)?.value);
  if (!benevoleId) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
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
    .from("benevoles")
    .update({ notifications_enabled: body.enabled })
    .eq("id", benevoleId);

  if (error) {
    return NextResponse.json({ error: "Enregistrement impossible." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
