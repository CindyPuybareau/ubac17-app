import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { CHILD_SESSION_COOKIE, verifyChildSession } from "@/lib/child-session";

// Retour de Cindy du 2026-08-22, confirmé explicitement après lui avoir
// signalé que ça change la posture sécurité de l'espace Enfant (jusqu'ici
// strictement lecture seule, voir le commentaire de child-session.ts) :
// l'enfant peut changer SA PROPRE photo de profil, rien d'autre. Seule
// écriture jamais accordée à cette session — une seule colonne
// (players.avatar_url), un seul joueur (celui du cookie de session
// vérifié), un seul type de fichier (image).
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const playerId = verifyChildSession(cookieStore.get(CHILD_SESSION_COOKIE)?.value);
  if (!playerId) {
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Choisis une image." }, { status: 400 });
  }
  // Garde-fou taille, même limite que ce qu'un mobile produit en pratique
  // pour une photo de profil (pas un vrai import de fichier volumineux) :
  // 8 Mo.
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Image trop volumineuse (8 Mo max)." }, { status: 400 });
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  // Préfixe "players/" : namespace distinct des dossiers "{uid}/" utilisés
  // par avatar-upload.tsx (Bureau/Coach/Famille), qui reposent sur
  // auth.uid() — inexistant pour cette session, donc jamais le même
  // chemin par construction.
  const path = `players/${playerId}/avatar.${ext}`;
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, Buffer.from(arrayBuffer), {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });
  if (uploadError) {
    return NextResponse.json({ error: "Envoi impossible, réessaie." }, { status: 500 });
  }

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Casse le cache navigateur (upsert -> même chemin qu'avant).
  const bustedUrl = `${data.publicUrl}?t=${Date.now()}`;
  const { error: updateError } = await supabase
    .from("players")
    .update({ avatar_url: bustedUrl })
    .eq("id", playerId);
  if (updateError) {
    return NextResponse.json({ error: "Enregistrement impossible, réessaie." }, { status: 500 });
  }

  return NextResponse.json({ url: bustedUrl });
}
