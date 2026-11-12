import { createClient } from "@/lib/supabase/client";
import { resizeImageForTeamPhoto } from "@/lib/image-resize";

// Envoi de la photo d'une équipe (bucket public team-photos + teams.photo_url),
// partagé par le tableau de bord Coach (space-dashboard-summary.tsx) et
// l'écran Bureau "Vie du club → Photos d'équipe" (team-photos-manager.tsx,
// retour de Cindy du 12/11) -- une seule implémentation, jamais recopiée.
// Côté client uniquement : l'écriture passe par les règles d'accès du
// bucket et de teams (Bureau, ou coach de l'équipe).
export async function uploadTeamPhoto(
  teamId: string,
  file: File
): Promise<{ url: string } | { error: string }> {
  if (!file.type.startsWith("image/")) return { error: "Choisis une image." };
  try {
    const { blob, ext } = await resizeImageForTeamPhoto(file);
    const supabase = createClient();
    const path = `${teamId}/photo.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from("team-photos")
      .upload(path, blob, { upsert: true, cacheControl: "3600", contentType: blob.type || file.type });
    if (uploadErr) return { error: "Envoi impossible, réessaie." };
    const { data } = supabase.storage.from("team-photos").getPublicUrl(path);
    // ?t= : la même adresse est réutilisée à chaque remplacement -- sans ce
    // marqueur, navigateurs et CDN resserviraient l'ancienne photo.
    const bustedUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error: updateErr } = await supabase.from("teams").update({ photo_url: bustedUrl }).eq("id", teamId);
    if (updateErr) return { error: "Enregistrement impossible, réessaie." };
    return { url: bustedUrl };
  } catch {
    return { error: "Image illisible, réessaie avec une autre photo." };
  }
}
