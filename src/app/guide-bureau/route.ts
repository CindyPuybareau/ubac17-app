import { NextResponse } from "next/server";
import { createClient, getCurrentUser } from "@/lib/supabase/server";
import { guideResponse } from "@/lib/guide-page";

// Guide du Bureau (retour de Cindy du 20/11 : "intégrer le guide côté
// Bureau, un symbole à côté de l'organigramme") : la même page que le lien
// partagé par email (docs/guide-bureau/guide-bureau.html). Réservé au
// Bureau : un membre non connecté repart vers la connexion, un non-membre
// du Bureau vers son tableau de bord.
export async function GET(request: Request) {
  const [supabase, user] = await Promise.all([createClient(), getCurrentUser()]);
  if (!user) return NextResponse.redirect(new URL("/connexion", request.url));

  const { data: admin } = await supabase
    .from("club_administrators")
    .select("club_function")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle();
  if (!admin) return NextResponse.redirect(new URL("/dashboard", request.url));

  return guideResponse("docs", "guide-bureau", "guide-bureau.html");
}
