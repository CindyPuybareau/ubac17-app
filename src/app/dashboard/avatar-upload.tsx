"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Photo de profil façon Facebook (retour de Cindy du 2026-08-22) : un rond
// avec la photo (ou les initiales, tant qu'aucune n'est envoyée), une
// petite icône appareil photo pour en changer. <img> brut plutôt que
// next/image : le domaine du bucket Supabase Storage n'est pas whitelisté
// dans next.config, et la taille fixe/petite de l'avatar rend
// l'optimisation automatique peu utile ici.
export default function AvatarUpload({
  userId,
  avatarUrl,
  name,
  size = "md",
}: {
  userId: string;
  avatarUrl: string | null;
  name: string | null;
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    const supabase = createClient();
    const ext = file.name.split(".").pop() || "jpg";
    // Toujours le même nom par utilisateur (upsert) : une nouvelle photo
    // remplace l'ancienne au lieu d'accumuler des fichiers orphelins dans
    // le bucket.
    const path = `${userId}/avatar.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, cacheControl: "3600" });
    if (uploadError) {
      setUploading(false);
      setError("Envoi impossible, réessaie.");
      return;
    }
    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    // Casse le cache navigateur : même chemin de fichier qu'avant (upsert),
    // sans ce paramètre l'ancienne photo resterait affichée après un
    // remplacement.
    const bustedUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: bustedUrl })
      .eq("id", userId);
    setUploading(false);
    if (updateError) {
      setError("Enregistrement impossible, réessaie.");
      return;
    }
    router.refresh();
  }

  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  const dimensionClass = size === "lg" ? "h-20 w-20 sm:h-24 sm:w-24" : "h-14 w-14";
  const textClass = size === "lg" ? "text-2xl sm:text-3xl" : "text-lg";

  return (
    <div className="relative shrink-0">
      <div
        className={`overflow-hidden rounded-full border-4 border-white bg-ubac-yellow/20 shadow-md ${dimensionClass}`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className={`flex h-full w-full items-center justify-center font-bold text-navy ${textClass}`}>
            {initial}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="Changer la photo de profil"
        className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-navy text-white shadow-sm transition-colors hover:bg-navy-dark disabled:opacity-60"
      >
        <Camera className="h-3.5 w-3.5" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFileChange}
        className="hidden"
      />
      {error && (
        <p className="absolute left-1/2 top-full mt-1 w-max max-w-[10rem] -translate-x-1/2 text-center text-[11px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
