"use client";

import { useMemo, useState } from "react";
import type { AdminCotisation } from "./page";

const statutLabels: Record<string, { label: string; className: string }> = {
  PAYE: { label: "Payé", className: "bg-green-100 text-green-700" },
  EN_ATTENTE: { label: "En attente", className: "bg-amber-100 text-amber-700" },
  OFFERT: { label: "Offert", className: "bg-ubac-blue/10 text-ubac-blue" },
};

function formatAmount(value: number | null) {
  return value === null ? "—" : `${value} €`;
}

export default function CotisationsTable({
  cotisations,
}: {
  cotisations: AdminCotisation[];
}) {
  const [filter, setFilter] = useState("ALL");

  const filtered = useMemo(
    () =>
      filter === "ALL"
        ? cotisations
        : cotisations.filter((c) => c.statut === filter),
    [cotisations, filter]
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {["ALL", "PAYE", "EN_ATTENTE", "OFFERT"].map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key
                ? "border-ubac-yellow bg-ubac-yellow/10 text-ubac-yellow-dark"
                : "border-zinc-200 text-zinc-600"
            }`}
          >
            {key === "ALL" ? "Tous" : statutLabels[key]?.label ?? key}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Joueur</th>
                <th className="px-4 py-3 font-semibold">Catégorie</th>
                <th className="px-4 py-3 font-semibold">Saison</th>
                <th className="px-4 py-3 font-semibold">Prix</th>
                <th className="px-4 py-3 font-semibold">Remise</th>
                <th className="px-4 py-3 font-semibold">Payé</th>
                <th className="px-4 py-3 font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((c) => {
                const statut = c.statut ? statutLabels[c.statut] : null;
                return (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 text-zinc-900">{c.playerName}</td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {c.category ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">{c.saison}</td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {formatAmount(c.prix)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {formatAmount(c.remise)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {formatAmount(c.paiement)}
                    </td>
                    <td className="px-4 py-2.5">
                      {statut ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statut.className}`}
                        >
                          {statut.label}
                        </span>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-zinc-400"
                  >
                    Aucune cotisation pour ce filtre.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
