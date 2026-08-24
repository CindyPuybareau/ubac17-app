"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, CreditCard, Receipt } from "lucide-react";
import {
  balanceDue,
  computeStatus,
  formatAmount,
  due,
} from "./cotisation-participants-table";
import type { AdminCotisation } from "./page";

const statusBadge: Record<string, { label: string; className: string }> = {
  PAYE: { label: "Payé", className: "bg-green-100 text-green-700" },
  PARTIEL: { label: "Partiel", className: "bg-orange-100 text-orange-700" },
  OFFERT: { label: "Offert", className: "bg-amber-100 text-amber-700" },
  EN_ATTENTE: { label: "En attente", className: "bg-red-100 text-red-700" },
};

function formatPaidAt(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

// Le libellé change selon qu'il s'agit de la cotisation de saison ou d'une
// collecte (stage, tournoi, boutique) — une ligne "2026" seule ne dirait
// pas à quoi elle correspond une fois plusieurs collectes accumulées.
function labelFor(c: AdminCotisation) {
  return c.collecteName ?? `Cotisation ${c.saison}`;
}

function Row({ c }: { c: AdminCotisation }) {
  const [open, setOpen] = useState(false);
  const status = computeStatus(c);
  const badge = statusBadge[status];
  const solde = balanceDue(c);

  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-800">{labelFor(c)}</p>
          <p className="text-xs text-zinc-500">{c.playerName}</p>
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

// Lecture seule, volontairement : une famille consulte où elle en est,
// elle ne corrige rien depuis ici — toute correction reste au Bureau.
//
// Une fois réglée, une cotisation n'a plus rien à signaler : l'onglet
// Organisation sert à repérer ce qui reste à faire, pas à archiver ce qui
// est déjà bouclé. Elle disparaît donc d'ici une fois "Payé" — sans
// jamais toucher à la donnée elle-même, seulement à ce qui s'affiche.
export default function FamilyCotisationCard({
  cotisations,
}: {
  cotisations: AdminCotisation[];
}) {
  const pending = cotisations.filter((c) => computeStatus(c) !== "PAYE");

  if (cotisations.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <CreditCard className="h-3.5 w-3.5 text-blue-700" />
          Ma cotisation
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Aucune cotisation enregistrée pour l&apos;instant.
        </p>
      </div>
    );
  }

  if (pending.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <CreditCard className="h-3.5 w-3.5 text-blue-700" />
          Ma cotisation
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Tout est réglé, rien à signaler.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm sm:p-5">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <CreditCard className="h-3.5 w-3.5 text-blue-700" />
        Ma cotisation
      </p>
      <div className="flex flex-col gap-2">
        {pending.map((c) => (
          <Row key={c.id} c={c} />
        ))}
      </div>
    </div>
  );
}
