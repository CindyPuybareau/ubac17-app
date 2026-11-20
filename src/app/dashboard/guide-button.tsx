import { BookOpen } from "lucide-react";

// Guide du Bureau (retour de Cindy du 20/11) : petit livre dans un rond
// jaune un peu transparent, sous le prénom dans la bande bleue de l'en-tête,
// seulement pour le Bureau (voir layout.tsx). Même présentation sur tous les
// écrans ("sur grand écran aussi un rond jaune comme sur téléphone") ; à
// droite à côté de l'organigramme, il mangeait le prénom sur téléphone.
// Ouvre le guide dans un nouvel onglet pour garder l'appli ouverte à côté.
// Bureau : guide du Bureau ; coach (hors Bureau) : guide des coachs (retour
// de Cindy du 20/11).
export default function GuideButton({ audience = "bureau" }: { audience?: "bureau" | "coach" }) {
  const href = audience === "coach" ? "/guide-coach" : "/guide-bureau";
  const label = audience === "coach" ? "Guide des coachs" : "Guide du Bureau";
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      title={label}
      aria-label={`Ouvrir le ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
      className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-ubac-yellow/30 text-ubac-yellow transition-colors hover:bg-ubac-yellow/45 sm:h-8 sm:w-8"
    >
      <BookOpen className="h-4 w-4 shrink-0" />
    </a>
  );
}
