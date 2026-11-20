import { BookOpen } from "lucide-react";

// Guide du Bureau (retour de Cindy du 20/11) : petit livre dans la bande
// bleue de l'en-tête, seulement pour le Bureau (voir layout.tsx). Ouvre le
// guide dans un nouvel onglet pour garder l'appli ouverte à côté.
//
// Deux présentations (retour de Cindy du 20/11, "sur mobile le symbole
// livre mange le prénom") :
// - "header" (écrans moyens et grands) : icône à côté de l'organigramme,
//   mêmes codes couleur que l'organigramme et la cloche ;
// - "under-name" (téléphone) : petit rond jaune un peu transparent sous le
//   prénom, pour laisser toute la largeur au prénom.
export default function GuideButton({ variant = "header" }: { variant?: "header" | "under-name" }) {
  if (variant === "under-name") {
    return (
      <a
        href="/guide-bureau"
        target="_blank"
        rel="noopener"
        title="Guide du Bureau"
        aria-label="Ouvrir le guide du Bureau"
        className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-ubac-yellow/30 text-ubac-yellow transition-colors hover:bg-ubac-yellow/45 sm:hidden"
      >
        <BookOpen className="h-4 w-4 shrink-0" />
      </a>
    );
  }
  return (
    <a
      href="/guide-bureau"
      target="_blank"
      rel="noopener"
      title="Guide du Bureau"
      aria-label="Ouvrir le guide du Bureau"
      className="hidden shrink-0 items-center gap-1.5 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:flex"
    >
      <BookOpen className="h-5 w-5 shrink-0" />
    </a>
  );
}
