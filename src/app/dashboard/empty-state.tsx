import Image from "next/image";
import type { LucideIcon } from "lucide-react";

// Composant partagé pour les tableaux/listes vides (tâche 8 du topo
// "Maillot Neuf UBAC", retour de Cindy du 2026-08-24 : "utiliser le vrai
// logo (en dégradé/discret) dans les tableaux vides ... plutôt qu'un gris
// générique") — un seul point de vérité pour ce traitement, réutilisable
// aussi bien dans un <td colSpan> de tableau que dans un simple <div>.
export default function EmptyState({
  icon: Icon,
  message,
  hint,
  className = "",
}: {
  icon?: LucideIcon;
  message: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`relative flex flex-col items-center justify-center gap-2 overflow-hidden py-10 text-center ${className}`}>
      <Image
        src="/logo.png"
        alt=""
        aria-hidden
        width={112}
        height={112}
        className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.05] grayscale"
      />
      <div className="relative flex flex-col items-center gap-2">
        {Icon && (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy/5 text-navy/40">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <p className="text-sm font-medium text-zinc-500">{message}</p>
        {hint && <p className="text-xs text-zinc-400">{hint}</p>}
      </div>
    </div>
  );
}
