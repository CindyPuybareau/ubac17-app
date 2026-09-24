"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Receipt } from "lucide-react";
import {
  balanceDue,
  computeStatus,
  formatAmount,
  due,
  statusBadge,
} from "./cotisation-participants-table";
import type { AdminCotisation } from "./page";

function formatPaidAt(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Le libellé change selon qu'il s'agit de la cotisation de saison ou d'une
// collecte (stage, tournoi, boutique) — une ligne "2026" seule ne dirait
// pas à quoi elle correspond une fois plusieurs collectes accumulées.
function labelFor(c: AdminCotisation) {
  return c.collecteName ?? `Cotisation ${c.saison}`;
}

// Ligne partagée entre "Cotisation & Licence" (family-cotisation-card.tsx)
// et "Événements payants" (event-cotisations-card.tsx) — extraite le 24/09
// (retour de Cindy : "ça doit s'appeler événement payant... presque une
// autre carte, pas la cotisation de la licence, rien à voir") pour que les
// deux cartes distinctes restent visuellement cohérentes sans dupliquer ce
// rendu.
export default function CotisationRow({
  c,
  showPlayerName = true,
}: {
  c: AdminCotisation;
  showPlayerName?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = computeStatus(c);
  const badge = statusBadge[status];
  const solde = balanceDue(c);

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-800">{labelFor(c)}</p>
          {showPlayerName && <p className="text-xs text-zinc-500">{c.playerName}</p>}
        </div>
        <span
          className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div>
          <p className="text-zinc-400">Montant</p>
          <p className="font-semibold text-zinc-800">{formatAmount(due(c))}</p>
        </div>
        <div>
          <p className="text-zinc-400">Réglé</p>
          <p className="font-semibold text-zinc-800">{formatAmount(c.paiement)}</p>
        </div>
        <div>
          <p className="text-zinc-400 sm:whitespace-nowrap">Reste à payer</p>
          <p className={`font-semibold ${solde > 0 ? "text-red-600" : "text-zinc-800"}`}>
            {formatAmount(solde)}
          </p>
        </div>
        {c.mode_paiement && (
          <div>
            <p className="text-zinc-400">Mode</p>
            <p className="font-semibold text-zinc-800">{c.mode_paiement}</p>
          </div>
        )}
      </div>

      {c.payments.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-700"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {open ? "Masquer" : "Voir"} le détail des règlements ({c.payments.length})
          </button>
          {open && (
            <ul className="mt-1.5 flex flex-col gap-1 border-l border-zinc-200 pl-2.5">
              {c.payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="flex items-center gap-1">
                    <Receipt className="h-3 w-3 shrink-0" />
                    {p.mode}
                    {p.detail ? ` · ${p.detail}` : ""}
                  </span>
                  <span className="shrink-0 font-medium text-zinc-600">
                    {formatAmount(p.amount)} · {formatPaidAt(p.paidAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
