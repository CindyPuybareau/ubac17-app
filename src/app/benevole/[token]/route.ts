import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { signBenevoleSession, BENEVOLE_SESSION_COOKIE } from "@/lib/benevole-session";

// Point d'entrée du lien privé envoyé par le Bureau à un bénévole (voir
// benevoles-manager.tsx, "Copier le lien"). Contrairement à l'Espace
// Enfant (une page, avec un choix de prénom + un code à saisir), un
// bénévole est seul sur son lien : pas d'étape intermédiaire, juste une
// vérification côté serveur puis redirection — le jeton dans l'URL EST la
// preuve d'identité. Route handler (pas une page) parce que poser un
// cookie exige une réponse HTTP, impossible depuis un Server Component en
// cours de rendu.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const url = new URL(request.url);

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch {
    return NextResponse.redirect(new URL("/benevole/erreur", url));
  }

  const { data } = await supabase
    .from("benevoles")
    .select("id, archived_at")
    .eq("access_token", token)
    .maybeSingle();

  if (!data || data.archived_at) {
    return NextResponse.redirect(new URL("/benevole/erreur", url));
  }

  const { token: sessionToken, maxAgeSeconds } = signBenevoleSession(data.id);
  const response = NextResponse.redirect(new URL("/benevole/view", url));
  response.cookies.set(BENEVOLE_SESSION_COOKIE, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return response;
}
