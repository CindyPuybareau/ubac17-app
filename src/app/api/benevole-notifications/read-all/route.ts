import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { BENEVOLE_SESSION_COOKIE, verifyBenevoleSession } from "@/lib/benevole-session";

// Seule autre écriture possible depuis l'espace bénévole (avec /api/
// benevole-signup et /api/benevole-rsvp) : un accusé de lecture ("ce
// bénévole a vu cette alerte"). Plus simple que la route équivalente côté
// enfant (read-all/route.ts) : un bénévole est notifié individuellement
// (benevole_id), jamais par équipe — pas de teamOrClubWideFilter à
// recalculer ici.
export async function POST() {
  const cookieStore = await cookies();
  const benevoleId = verifyBenevoleSession(cookieStore.get(BENEVOLE_SESSION_COOKIE)?.value);
  if (!benevoleId) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: notifRows } = await supabase
    .from("notifications")
    .select("id")
    .eq("benevole_id", benevoleId)
    .order("created_at", { ascending: false })
    .limit(200);

  const notifIds = (notifRows ?? []).map((n) => n.id);
  if (notifIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { data: alreadyRead } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("benevole_id", benevoleId)
    .in("notification_id", notifIds);
  const alreadyReadIds = new Set((alreadyRead ?? []).map((r) => r.notification_id));

  const toInsert = notifIds
    .filter((id) => !alreadyReadIds.has(id))
    .map((id) => ({ notification_id: id, benevole_id: benevoleId }));

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("notification_reads").insert(toInsert);
    if (insertError) {
      console.error("[benevole-notifications/read-all] insert échoué:", insertError);
    }
  }

  return NextResponse.json({ ok: true });
}
