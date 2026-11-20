import { BookOpen } from "lucide-react";

// Guide du Bureau (retour de Cindy du 20/11) : petit livre dans un rond
// jaune un peu transparent, sous le prénom dans la bande bleue de l'en-tête,
// seulement pour le Bureau (voir layout.tsx). Même présentation sur tous les
// écrans ("sur grand écran aussi un rond jaune comme sur téléphone") ; à
// droite à côté de l'organigramme, il mangeait le prénom sur téléphone.
// Ouvre le guide dans un nouvel onglet pour garder l'appli ouverte à côté.
export default function GuideButton() {
  return (
    <a
      href="/guide-bureau"
      target="_blank"
      rel="noopener"
      title="Guide du Bureau"
      aria-label="Ouvrir le guide du Bureau"
      className="mt-1 flex h-7 w-7 items-center justify-center rounded-full bg-ubac-yellow/30 text-ubac-yellow transition-colors hover:bg-ubac-yellow/45 sm:h-8 sm:w-8"
    >
      <BookOpen className="h-4 w-4 shrink-0" />
    </a>
  );
}
