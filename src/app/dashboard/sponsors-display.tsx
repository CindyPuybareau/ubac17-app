import { Handshake } from "lucide-react";
import type { SponsorDisplay } from "./page";

// Retour de Cindy du 29/08 : logos des sponsors visibles dans tous les
// espaces (Bureau/Coach/Famille), jamais côté Enfant (voir child-dashboard.tsx,
// ce composant n'y est simplement jamais importé). Même esprit que la
// section "Nos partenaires" du site public (src/app/page.tsx) — nom sous le
// logo cette fois (retour de Cindy), les deux lisent la même donnée
// (sponsor_display) donc jamais besoin de mettre à jour deux endroits.
export default function SponsorsDisplay({ sponsors }: { sponsors: SponsorDisplay[] }) {
  if (sponsors.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
        <Handshake className="h-3.5 w-3.5" />
        Nos sponsors
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {sponsors.map((s) => {
          const card = (
            <>
              {/* <img> brut plutôt que next/image (même raison qu'avatar-
                  upload.tsx) : le logo peut venir du bucket Storage
                  sponsor-logos, domaine non whitelisté dans next.config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={s.logoUrl}
                alt={s.name}
                className="h-12 w-full object-contain"
              />
              <span className="truncate text-center text-xs font-medium text-zinc-500">
                {s.name}
              </span>
            </>
          );
          return s.websiteUrl ? (
            <a
              key={s.id}
              href={s.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={s.name}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-100 p-3 transition-colors hover:bg-zinc-50"
            >
              {card}
            </a>
          ) : (
            <div
              key={s.id}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-zinc-100 p-3"
            >
              {card}
            </div>
          );
        })}
      </div>
    </div>
  );
}
