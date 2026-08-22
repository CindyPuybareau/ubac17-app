"use client";

import { useState } from "react";
import Image from "next/image";
import { ChartNetwork, X } from "lucide-react";

// Organigramme du club (retour de Cindy du 2026-08-22) : une seule image
// statique (pas de PDF — peu fiable à afficher inline sur mobile/PWA),
// affichée dans une fenêtre au clic plutôt qu'un onglet séparé. Utilisé
// depuis le bandeau "Bienvenue" (visible sur tous les espaces, page.tsx)
// et depuis l'espace enfant (child-dashboard.tsx) — même fichier partout,
// un seul endroit à remplacer si l'organigramme change en cours de saison.
export default function OrgChartButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Retour de Cindy du 2026-08-22 : déplacé dans la bande bleue de
          l'en-tête (à gauche de la cloche), plutôt qu'à côté de
          "Bienvenue" — mêmes codes couleur que les autres boutons de cet
          en-tête (notification-bell.tsx, mobile-menu-button.tsx) pour
          rester visible sur fond navy. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Voir l'organigramme du club"
        className="flex shrink-0 items-center gap-1.5 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <ChartNetwork className="h-5 w-5 shrink-0" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                <ChartNetwork className="h-4 w-4 shrink-0 text-navy" />
                Organigramme du club
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto p-2">
              <Image
                src="/organigramme.jpg"
                alt="Organigramme de l'UBAC"
                width={2400}
                height={1600}
                className="h-auto w-full rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
