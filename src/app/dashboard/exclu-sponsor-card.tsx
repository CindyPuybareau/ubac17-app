"use client";

import { useState } from "react";
import { Gift, Handshake, Phone, X } from "lucide-react";
import type { SponsorDisplay } from "./page";

// Retour de Cindy du 10/11 ("Exclu sponsor") : carte à côté de
// BoutiqueCard (même grille partagée KPI_GRID_CLASSES,
// kpi-grid-classes.ts), accent doré (ubac-yellow, déjà la couleur club)
// pour se distinguer du bleu nuit de Boutique. Au clic, popup listant
// TOUS les sponsors (sponsor_display filtre déjà "sans logo" en amont,
// règle préexistante inchangée) -- jamais filtré sur la présence d'une
// offre : un sponsor sans offre renseignée reste visible (nom + logo),
// seule sa ligne d'offre ne s'affiche pas (retour de Cindy, "on doit
// voir tous les sponsors si rien, mettre au moins le logo").
export default function ExcluSponsorCard({ sponsors }: { sponsors: SponsorDisplay[] }) {
  const [open, setOpen] = useState(false);

  if (sponsors.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-ubac-yellow via-ubac-yellow to-ubac-yellow-dark px-4 py-4 text-center shadow-sm transition-opacity hover:opacity-90"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25">
          <Gift className="h-5 w-5 shrink-0 text-navy" />
        </span>
        <span className="text-sm font-semibold text-navy">Exclu sponsor</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-zinc-900">
                <Gift className="h-4 w-4 shrink-0 text-ubac-yellow-dark" />
                Offres de nos sponsors
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Retour de Cindy du 11/11 ("je ne souhaite pas de flèche
                haut/bas, pouvoir scroller") : scrollbar native de l'OS
                remplacée par la même scrollbar fine personnalisée que
                members-table.tsx (pas de boutons flèche, juste un
                "pouce" discret) -- simple liste qui scrolle, sans
                contrôle de navigation séparé. */}
            <div className="flex flex-col gap-2.5 overflow-y-auto p-4 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 [&::-webkit-scrollbar-track]:bg-transparent">
              {sponsors.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 p-3"
                >
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.logoUrl}
                      alt={s.name}
                      className="h-12 w-12 shrink-0 rounded-lg border border-zinc-100 bg-white object-contain p-1"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-200 text-zinc-300">
                      <Handshake className="h-5 w-5" />
                    </div>
                  )}
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-semibold text-zinc-900">{s.name}</span>
                    {s.offerText && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-ubac-yellow-dark">
                        <Gift className="h-3 w-3 shrink-0" />
                        {s.offerText}
                      </span>
                    )}
                    {/* Retour de Cindy du 11/11 ("on doit aussi avoir le
                        telephone des sponsors pour le joindre facilement") :
                        lien tel: cliquable, affiché même sans offre --
                        SEUL contact_phone est exposé club entier (jamais
                        le nom/email de contact, restés Bureau-only). */}
                    {s.contactPhone && (
                      <a
                        href={`tel:${s.contactPhone.replace(/\s+/g, "")}`}
                        className="flex items-center gap-1 text-xs font-medium text-zinc-500 hover:text-zinc-700 hover:underline"
                      >
                        <Phone className="h-3 w-3 shrink-0" />
                        {s.contactPhone}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
