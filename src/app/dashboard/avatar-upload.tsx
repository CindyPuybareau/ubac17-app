"use client";

import { useEffect, useRef, useState } from "react";
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
  // Affichage optimiste (retour de Cindy du 2026-08-22, "l'affichage après
  // l'import de la photo est trèèèèèès long") : la page dashboard charge
  // beaucoup de données, et router.refresh() re-render tout l'arbre
  // Server Component avec les nouvelles props une fois SEULEMENT ce
  // rechargement complet terminé — la nouvelle photo n'apparaissait donc
  // qu'après plusieurs secondes, alors que l'envoi lui-même est rapide.
  // En gardant l'URL localement et en l'affichant tout de suite, la photo
  // change à l'instant ; router.refresh() continue en arrière-plan pour
  // que le reste de la page (et un futur rechargement) reflète la même
  // valeur, sans plus jamais bloquer l'affichage.
  const [localAvatarUrl, setLocalAvatarUrl] = useState(avatarUrl);
  useEffect(() => {
    setLocalAvatarUrl(avatarUrl);
  }, [avatarUrl]);

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
    // try/finally (retour d'audit du 28/08, même motif que le bouton de
    // connexion bloqué du 18/08) : resizeImageForAvatar n'était couvert
    // par aucun filet — un fichier corrompu ou trop volumineux pour le
    // canvas laissait "uploading" à true pour toujours, bouton figé
    // jusqu'au rechargement complet, sans aucun message.
    try {
      // Recadré en carré et réencodé en WebP (retour d'audit du 2026-08-25,
      // "format .gif non optimisé") : jamais affiché à plus de 96px, pas
      // besoin d'envoyer le fichier d'origine tel quel — voir image-resize.ts.
      const { blob, ext } = await resizeImageForAvatar(file);
      // Toujours le même nom par utilisateur (upsert) : une nouvelle photo
      // remplace l'ancienne au lieu d'accumuler des fichiers orphelins dans
      // le bucket.
      const path = `${userId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, cacheControl: "3600", contentType: blob.type || file.type });
      if (uploadError) {
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
      if (updateError) {
        setError("Enregistrement impossible, réessaie.");
        return;
      }
      // Affiché tout de suite, sans attendre router.refresh() ci-dessous
      // (voir commentaire plus haut) — c'est ce qui rendait le changement de
      // photo si lent à se voir.
      setLocalAvatarUrl(bustedUrl);
      router.refresh();
    } catch {
      setError("Image illisible, réessaie avec une autre photo.");
    } finally {
      setUploading(false);
    }
  }

  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";
  const dimensionClass = size === "lg" ? "h-20 w-20 sm:h-24 sm:w-24" : "h-14 w-14";
  const textClass = size === "lg" ? "text-2xl sm:text-3xl" : "text-lg";

  return (
    <div className="relative shrink-0">
      <div
        className={`overflow-hidden rounded-full border-4 border-white bg-amber-100 shadow-md ${dimensionClass}`}
      >
        {localAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={localAvatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className={`flex h-full w-full items-center justify-center font-bold text-navy ${textClass}`}>
            {initial}
          </span>
        )}
      </div>
      {/* Icône plus discrète (retour de Cindy du 2026-08-22, "sur
          téléphone, l'icône appareil photo prend trop de place sur mon
          image") : plus petite, décalée vers l'extérieur du rond (déborde
          un peu du cadre plutôt que de s'écraser dessus) et fond
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
