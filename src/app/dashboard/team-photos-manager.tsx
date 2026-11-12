"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2 } from "lucide-react";
import { uploadTeamPhoto } from "@/lib/team-photo-upload";
import { teamLabel } from "@/lib/teams";
import { useToast } from "./toast-context";

type PhotoTeam = { id: string; name: string | null; category: string | null; photoUrl: string | null };

// Écran Bureau "Vie du club → Photos d'équipe" (retour de Cindy du 12/11,
// option A) : remplace le sélecteur d'équipe + photo du tableau de bord
// Bureau. Toutes les équipes d'un coup d'œil -- celles sans photo sautent
// aux yeux (logo UBAC à la place) -- avec un bouton "Ajouter"/"Remplacer"
// par équipe. Pas dans l'onglet Équipes (retour du 30/10, "l'ajout de
// photo ça ne me va pas dans Équipes"). Les coachs gardent leur propre
// bouton sur leur tableau de bord (space-dashboard-summary.tsx), même envoi
// (lib/team-photo-upload.ts).
export default function TeamPhotosManager({ teams }: { teams: PhotoTeam[] }) {
  const missingCount = teams.filter((t) => !t.photoUrl).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-600 shadow-sm">
        {missingCount === 0
          ? "Toutes les équipes ont leur photo."
          : `${missingCount} équipe${missingCount > 1 ? "s" : ""} sur ${teams.length} sans photo.`}{" "}
        La photo s&apos;affiche dans le tableau de bord de l&apos;équipe (coachs, familles, enfants). Format
        paysage conseillé.
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {teams.map((team) => (
          <TeamPhotoTile key={team.id} team={team} />
        ))}
      </div>
    </div>
  );
}

function TeamPhotoTile({ team }: { team: PhotoTeam }) {
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  // Photo envoyée pendant cette visite : affichée tout de suite, sans
  // attendre le rafraîchissement de la page.
  const [photoUrl, setPhotoUrl] = useState(team.photoUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = teamLabel(team);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError(null);
    const result = await uploadTeamPhoto(team.id, file);
    setUploading(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setPhotoUrl(result.url);
    showToast(`Photo de ${label} enregistrée.`);
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-2.5 shadow-sm">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-navy">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={`Photo de ${label}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy via-navy to-navy-dark">
            <Image src="/logo.png" alt="" width={44} height={44} className="object-contain opacity-80" />
          </div>
        )}
      </div>
      <p className="truncate text-sm font-semibold text-zinc-900">{label}</p>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          photoUrl
            ? "border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
            : "bg-ubac-yellow text-navy hover:bg-ubac-yellow-dark"
        }`}
      >
        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        {uploading ? "Envoi..." : photoUrl ? "Remplacer" : "Ajouter une photo"}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onChange} className="hidden" />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
