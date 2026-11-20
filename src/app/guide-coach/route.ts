import { NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { guideResponse } from "@/lib/guide-page";

// Guide des coachs (retour de Cindy du 20/11, "un petit livre aussi pour
// les coachs, ce qui les concerne") : docs/guide-coach/guide-coach.html.
// Ouvert aux coachs (au moins une équipe dans team_coaches) et au Bureau ;
// non connecté -> connexion, sinon -> tableau de bord.
export async function GET(request: Request) {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!user) return NextResponse.redirect(new URL("/connexion", request.url));

  const [{ count: coachTeams }, { data: admin }] = await Promise.all([
    supabase.from("team_coaches").select("team_id", { count: "exact", head: true }).eq("coach_id", user.id),
    supabase
      .from("club_administrators")
      .select("club_function")
      .eq("email", (user.email ?? "").toLowerCase())
      .maybeSingle(),
  ]);
  if (!coachTeams && !admin) return NextResponse.redirect(new URL("/dashboard", request.url));

  return guideResponse("docs", "guide-coach", "guide-coach.html");
}
