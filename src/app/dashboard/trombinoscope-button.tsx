"use client";

import { useState } from "react";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Retour de Cindy du 05/10 ("trombinoscope... les coachs en ont besoin
// pour chaque match officiel") : bucket privé (contrairement à
// team-photos, public) -- un trombinoscope liste noms + photos de TOUS
// les joueurs, pas une simple photo de groupe. Pas d'URL publique stockée
// en base : une URL signée (1h, largement assez pour un clic -> ouverture)
// est générée à la demande, au clic. Composant partagé entre team-card.tsx
// (fiche équipe), calendar-view.tsx (carte de match officiel) et, depuis
// le 08/10, club-documents.tsx (trombinoscope officiels, bucket distinct
// -- voir `bucket` ci-dessous).
export default function TrombinoscopeButton({
  path,
  bucket = "team-trombinoscopes",
  className,
}: {
  path: string | null;
  bucket?: "team-trombinoscopes" | "club-documents";
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  if (!path) return null;

  async function openTrombinoscope() {
    setLoading(true);
    setError(false);
    try {
      const supabase = createClient();
      const { data, error: signError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path as string, 3600);
      if (signError || !data?.signedUrl) {
        setError(true);
        return;
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={openTrombinoscope}
      disabled={loading}
      className={
        className ??
        // Retour de Cindy du 05/10 ("le bouton jaune pour plus de
        // visibilité") : une fois un fichier envoyé, c'est la vraie
        // action du quotidien (consulter avant un match) -- même jaune
        // plein que les CTA principaux de l'appli (ex. "Je me propose"
        // côté bénévoles, "Se connecter"), plus discret bg-navy/10
        // d'origine.
        "flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3 py-1.5 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
      }
    >
      <FileText className="h-3.5 w-3.5 shrink-0" />
      {loading ? "Ouverture…" : error ? "Indisponible, réessaie" : "Trombinoscope"}
    </button>
  );
}
