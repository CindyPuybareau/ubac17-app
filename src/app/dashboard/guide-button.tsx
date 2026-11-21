"use client";

import { BookOpen } from "lucide-react";
import { useSearchParams } from "next/navigation";

// Petit livre jaune sous le prénom (retours de Cindy du 20-21/11) : ouvre le
// guide qui correspond à l'espace affiché -- guide des coachs dans l'espace
// Coach (même pour un membre du Bureau qui coache aussi, "Basile côté coach
// voit le manuel Bureau ?"), guide du Bureau ailleurs pour le Bureau, guide
// des coachs pour un coach qui n'est pas au Bureau. Rien pour les autres.
// Même présentation sur tous les écrans (rond jaune un peu transparent sous
// le prénom). Ouvert dans la même page (dans l'appli installée sur
// téléphone, un nouvel onglet n'avait aucun bouton retour) -- le guide porte
// son propre bouton "Retour à l'appli" (src/lib/guide-page.ts).
export default function GuideButton({ isAdmin, isCoach }: { isAdmin: boolean; isCoach: boolean }) {
  const tab = useSearchParams().get("tab");
  // Espaces parent / joueur ("Mon équipe", "Mes enfants") : pas de livre,
  // même pour un membre du Bureau ou un coach (retour de Cindy du 21/11) --
  // on y est vu comme une famille.
  const familyTab = tab === "own-team" || tab === "children";
  const audience: "bureau" | "coach" | null = familyTab
    ? null
    : tab === "coach" && isCoach
      ? "coach"
      : isAdmin
        ? "bureau"
        : isCoach
          ? "coach"
          : null;
  if (!audience) return null;
  const href = audience === "coach" ? "/guide-coach" : "/guide-bureau";
  const label = audience === "coach" ? "Guide des coachs" : "Guide du Bureau";
  return (
    <a
      href={href}
      title={label}
      aria-label={`Ouvrir le ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
      // Couleur par guide (retour de Cindy du 21/11, "qu'on voie la différence") :
      // jaune pour le Bureau, blanc transparent pour les coachs (le vert a
      // été jugé moche).
      className={`mt-1 flex h-7 w-7 items-center justify-center rounded-full transition-colors sm:h-8 sm:w-8 ${
        audience === "coach"
          ? "bg-white/20 text-white hover:bg-white/30"
          : "bg-ubac-yellow/30 text-ubac-yellow hover:bg-ubac-yellow/45"
      }`}
    >
      <BookOpen className="h-4 w-4 shrink-0" />
    </a>
  );
}
