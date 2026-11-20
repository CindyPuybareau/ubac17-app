import { BookOpen } from "lucide-react";

// Guide du Bureau (retour de Cindy du 20/11) : petit livre dans la bande
// bleue de l'en-tête, juste à côté de l'organigramme, seulement pour le
// Bureau (voir layout.tsx). Ouvre le guide dans un nouvel onglet pour
// garder l'appli ouverte à côté. Mêmes codes couleur que l'organigramme et
// la cloche (org-chart-button.tsx, notification-bell.tsx).
export default function GuideButton() {
  return (
    <a
      href="/guide-bureau"
      target="_blank"
      rel="noopener"
      title="Guide du Bureau"
      aria-label="Ouvrir le guide du Bureau"
      className="flex shrink-0 items-center gap-1.5 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
    >
      <BookOpen className="h-5 w-5 shrink-0" />
    </a>
  );
}
