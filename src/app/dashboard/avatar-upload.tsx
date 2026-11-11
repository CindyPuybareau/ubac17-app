"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resizeImageForAvatar } from "@/lib/image-resize";

// Photo de profil façon Facebook (retour de Cindy du 2026-08-22) : un rond
// avec la photo (ou les initiales, tant qu'aucune n'est envoyée), une
// petite icône appareil photo pour en changer. <img> brut plutôt que
// next/image : le domaine du bucket Supabase Storage n'est pas whitelisté
// dans next.config, et la taille fixe/petite de l'avatar rend
// l'optimisation automatique peu utile ici.
//
// Partagé avec l'Espace Enfant (userId absent) : même rendu, seul l'envoi
// diffère -- pas de session Supabase côté navigateur pour un enfant (voir
// child-session.ts), donc FormData vers /api/child-avatar plutôt qu'un
// appel direct à Supabase Storage.
export default function AvatarUpload({
  userId,
  avatarUrl,
  name,
}: {
  userId?: string;
  avatarUrl: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Affichage optimiste (retour de Cindy du 2026-08-22, "l'affichage après
  // l'import de la photo est trèèèèèès long") : router.refresh() re-render
  // tout l'arbre Server Component une fois SEULEMENT le rechargement
  // complet terminé -- la nouvelle photo est donc affichée tout de suite
  // localement, router.refresh() continuant en arrière-plan.
  // Ajusté pendant le rendu plutôt que dans un effet (lint
  // react-hooks/set-state-in-effect, nettoyage du 21/10).
  const [localAvatarUrl, setLocalAvatarUrl] = useState(avatarUrl);
  const [prevAvatarUrlProp, setPrevAvatarUrlProp] = useState(avatarUrl);
  if (avatarUrl !== prevAvatarUrlProp) {
    setPrevAvatarUrlProp(avatarUrl);
    setLocalAvatarUrl(avatarUrl);
  }

  // Compte connecté : envoi direct dans le bucket "avatars", toujours le
  // même nom par utilisateur (upsert, pas de fichiers orphelins), puis
  // profiles.avatar_url avec un paramètre anti-cache (même chemin qu'avant).
  async function uploadForProfile(id: string, blob: Blob, ext: string, fileType: string): Promise<string | null> {
    const supabase = createClient();
    const path = `${id}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, blob, { upsert: true, cacheControl: "3600", contentType: blob.type || fileType });
    if (uploadError) {
      setError("Envoi impossible, réessaie.");
      return null;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const bustedUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error: updateError } = await supabase.from("profiles").update({ avatar_url: bustedUrl }).eq("id", id);
    if (updateError) {
      setError("Enregistrement impossible, réessaie.");
      return null;
    }
    return bustedUrl;
  }

  async function uploadForChild(blob: Blob, ext: string): Promise<string | null> {
    const formData = new FormData();
    formData.append("file", blob, `avatar.${ext}`);
    const res = await fetch("/api/child-avatar", { method: "POST", body: formData });
    const body = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!res.ok) {
      setError(body?.error ?? "Envoi impossible, réessaie.");
      return null;
    }
    return body?.url ?? null;
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Repartir de zéro à chaque ouverture du sélecteur : sans ça, choisir
    // deux fois de suite le même fichier ne redéclenchait pas onChange.
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choisis une image.");
      return;
    }
    setUploading(true);
    setError(null);
    // try/finally (retour d'audit du 28/08) : un fichier corrompu ou trop
    // volumineux pour le canvas laissait "uploading" à true pour toujours.
    try {
      // Recadré en carré et réencodé en WebP (retour d'audit du 2026-08-25) :
      // jamais affiché à plus de 96px -- voir image-resize.ts.
      const { blob, ext } = await resizeImageForAvatar(file);
      const newUrl = userId
        ? await uploadForProfile(userId, blob, ext, file.type)
        : await uploadForChild(blob, ext);
      if (!newUrl) return;
      setLocalAvatarUrl(newUrl);
      router.refresh();
    } catch {
      setError("Image illisible, réessaie avec une autre photo.");
    } finally {
      setUploading(false);
    }
  }

  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative shrink-0">
      <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-amber-100 shadow-md sm:h-24 sm:w-24">
        {localAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={localAvatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-navy sm:text-3xl">
            {initial}
          </span>
        )}
      </div>
      {/* Icône plus discrète (retour de Cindy du 2026-08-22, "sur
          téléphone, l'icône appareil photo prend trop de place sur mon
          image") : plus petite, décalée vers l'extérieur du rond et fond
          semi-transparent pour laisser deviner la photo en dessous. */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Changer la photo de profil"
        className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-navy/70 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-navy-dark disabled:opacity-60"
      >
        <Camera className="h-3 w-3" />
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
      {error && (
        <p className="absolute left-1/2 top-full mt-1 w-max max-w-[10rem] -translate-x-1/2 text-center text-[11px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
