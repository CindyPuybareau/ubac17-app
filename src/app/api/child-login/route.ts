import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidPinFormat } from "@/lib/pin";
import { CHILD_SESSION_COOKIE, signChildSession } from "@/lib/child-session";

// Seul rôle de cette route : appeler verify_child_pin (voir la migration
// 20261008000000_child_pin_access.sql, qui porte toute la logique
// d'autorisation/blocage) puis, si le PIN est correct, poser le cookie de
// session enfant — une opération obligatoirement serveur (httpOnly),
// impossible à faire depuis le composant client qui appelle cette route.
export async function POST(request: Request) {
  let body: { code?: string; playerId?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { code, playerId, pin } = body;
  if (!code || !playerId || !pin || !isValidPinFormat(pin)) {
    return NextResponse.json({ error: "Code incorrect." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("verify_child_pin", {
    p_code: code,
    p_player_id: playerId,
    p_pin: pin,
  });

  if (error) {
    // Message volontairement générique côté blocage anti-brute-force :
    // le texte exact de verify_child_pin ("Trop de tentatives...") reste
    // sûr à montrer tel quel, il ne révèle rien de plus qu'un compteur.
    const locked = error.message?.includes("Trop de tentatives");
    return NextResponse.json(
      { error: locked ? error.message : "Une erreur est survenue." },
      { status: locked ? 429 : 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ error: "Code incorrect." }, { status: 401 });
  }

  const { token, maxAgeSeconds } = signChildSession(data as string);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CHILD_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return response;
}
