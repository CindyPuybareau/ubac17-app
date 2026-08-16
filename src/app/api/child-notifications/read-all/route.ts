import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { CHILD_SESSION_COOKIE, verifyChildSession } from "@/lib/child-session";

// Seule écriture possible depuis l'Espace Enfant, volontairement réduite
// au strict minimum : un accusé de lecture ("cet enfant a vu cette
// alerte"), jamais une donnée du club. Le cookie de session (voir
// child-session.ts) est revérifié ici, côté serveur — jamais fait
// confiance au playerId que le client pourrait prétendre être.
export async function POST() {
  const cookieStore = await cookies();
  const playerId = verifyChildSession(cookieStore.get(CHILD_SESSION_COOKIE)?.value);
  if (!playerId) {
    return NextResponse.json({ error: "Session expirée." }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: ownTeamLinks } = await supabase
    .from("team_players")
    .select("team_id")
    .eq("player_id", playerId);
  const teamIds = (ownTeamLinks ?? []).map((t) => t.team_id);

  const query = supabase.from("notifications").select("id").order("created_at", { ascending: false }).limit(200);
  const { data: notifRows } =
    teamIds.length > 0 ? await query.or(`team_id.is.null,team_id.in.(${teamIds.join(",")})`) : await query.is("team_id", null);

  const notifIds = (notifRows ?? []).map((n) => n.id);
  if (notifIds.length === 0) {
    return NextResponse.json({ ok: true });
  }

  const { data: alreadyRead } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("player_id", playerId)
    .in("notification_id", notifIds);
  const alreadyReadIds = new Set((alreadyRead ?? []).map((r) => r.notification_id));

  const toInsert = notifIds
    .filter((id) => !alreadyReadIds.has(id))
    .map((id) => ({ notification_id: id, player_id: playerId }));

  if (toInsert.length > 0) {
    await supabase.from("notification_reads").insert(toInsert);
  }

  return NextResponse.json({ ok: true });
}
