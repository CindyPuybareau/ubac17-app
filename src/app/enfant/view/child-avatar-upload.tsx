"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

// Même rendu que dashboard/avatar-upload.tsx (rond + icône appareil photo),
// mais un mécanisme d'envoi différent : pas de session Supabase côté
// navigateur pour cet espace (voir child-session.ts), donc FormData vers
// /api/child-avatar plutôt qu'un appel direct à Supabase Storage.
export default function ChildAvatarUpload({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null;
  name: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choisis une image.");
      return;
    }
    setUploading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/child-avatar", { method: "POST", body: formData });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Envoi impossible, réessaie.");
        return;
      }
      router.refresh();
    } catch {
      setError("Envoi impossible, réessaie.");
    } finally {
      setUploading(false);
    }
  }

  const initial = name?.trim()?.[0]?.toUpperCase() ?? "?";

  return (
    <div className="relative shrink-0">
      <div className="h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-amber-100 shadow-md sm:h-24 sm:w-24">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-navy sm:text-3xl">
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
