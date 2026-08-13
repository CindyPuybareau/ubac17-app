"use client";

import { useState } from "react";
import { Navigation } from "lucide-react";

// Chacun a son habitude : imposer Google Maps à qui navigue sur Waze
// oblige à recopier l'adresse à la main. Les deux liens partent de la
// même requête, c'est l'application qui change.
export default function ItineraryButton({
  query,
  className,
}: {
  // Adresse ou lieu à chercher. Null = rien à proposer.
  query: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!query) return null;

  const encoded = encodeURIComponent(query);
  const links = [
    {
      label: "Google Maps",
      href: `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    },
    // navigate=yes lance directement le guidage plutôt que d'ouvrir une
    // fiche de lieu.
    { label: "Waze", href: `https://waze.com/ul?q=${encoded}&navigate=yes` },
  ];

  return (
    <div className="relative w-fit">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          className ??
          "flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50"
        }
      >
        <Navigation className="h-3.5 w-3.5 shrink-0" />
        Itinéraire
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 flex w-44 flex-col gap-1 rounded-xl border border-zinc-100 bg-white p-1.5 shadow-lg">
          {links.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              {l.label}
            </a>
          ))}
          <p className="px-2.5 pb-0.5 pt-1 text-[10px] leading-tight text-zinc-400">
            {query}
          </p>
        </div>
      )}
    </div>
  );
}
