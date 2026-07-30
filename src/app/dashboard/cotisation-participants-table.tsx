"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  Contact,
  CreditCard,
  FileText,
  Mail,
  MoreVertical,
  Percent,
  Receipt,
  Search,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import MemberDetailModal from "./member-detail-modal";
import type { AdminCotisation, AdminMember } from "./page";

type StatusKey = "PAYE" | "OFFERT" | "EN_ATTENTE";

const statusBadge: Record<StatusKey, { label: string; className: string }> = {
  PAYE: { label: "Payé", className: "bg-green-100 text-green-700" },
  OFFERT: { label: "Offert", className: "bg-amber-100 text-amber-700" },
  EN_ATTENTE: { label: "En attente", className: "bg-red-100 text-red-700" },
};

const paymentModes = ["Chèque", "Espèces", "Virement", "Pass Sport", "Carte bancaire", "Autre"];

export function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

function due(c: AdminCotisation) {
  return Math.max(0, roundCents((c.prix ?? 0) - (c.remise ?? 0)));
}

// Trust the club's own Statut Club value when it's one of the three real
// statuses it uses (Payé/Payé (-), Offerte dirigeant/coach, En attente
// paiement — already normalized to these codes on import). Only fall back
// to deriving from amounts for rows with no recognized statut yet (e.g. a
// participant just added to a stage/event collecte).
export function computeStatus(c: AdminCotisation): StatusKey {
  if (c.statut === "PAYE" || c.statut === "OFFERT" || c.statut === "EN_ATTENTE") {
    return c.statut;
  }
  const d = due(c);
  const paid = c.paiement ?? 0;
  return d <= 0 || paid >= d ? "PAYE" : "EN_ATTENTE";
}

// Amounts are derived from floating-point arithmetic (prix - remise,
// running sums), which produces values like 2613.0899999999997 — round to
// cents and use French thousands/decimal separators.
export function formatAmount(value: number | null | undefined) {
  const cents = Math.round((value ?? 0) * 100);
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function openReceiptWindow(c: AdminCotisation, contactEmail: string | null) {
  const win = window.open("", "_blank");
  if (!win) return;
  const status = statusBadge[computeStatus(c)];
  win.document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Reçu - ${c.playerName}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 40px; color: #18181b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .muted { color: #71717a; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; }
  td, th { padding: 8px 0; border-bottom: 1px solid #e4e4e7; text-align: left; font-size: 14px; }
  th { color: #71717a; text-transform: uppercase; font-size: 11px; }
  .total { font-weight: 700; font-size: 16px; }
</style>
</head>
<body>
  <h1>UBAC 17 — Union Basket Angoulins Châtelaillon</h1>
  <p class="muted">Reçu / Facture — ${c.collecteName ?? `Cotisation ${c.saison}`}</p>
  <table>
    <tr><th>Membre</th><td>${c.playerName}</td></tr>
    <tr><th>Catégorie</th><td>${c.category ?? "—"}</td></tr>
    ${c.membershipType ? `<tr><th>Type d'adhésion</th><td>${c.membershipType}</td></tr>` : ""}
    ${contactEmail ? `<tr><th>Contact</th><td>${contactEmail}</td></tr>` : ""}
    <tr><th>Tarif</th><td>${formatAmount(c.prix)}</td></tr>
    <tr><th>Remise</th><td>${formatAmount(c.remise)}</td></tr>
    <tr><th>Montant payé</th><td>${formatAmount(c.paiement)}</td></tr>
    <tr><th>Mode de paiement</th><td>${c.mode_paiement ?? "—"}</td></tr>
    <tr><th>Statut</th><td>${status.label}</td></tr>
  </table>
  <p class="total" style="margin-top:16px;">Reste dû : ${formatAmount(Math.max(0, due(c) - (c.paiement ?? 0)))}</p>
</body>
</html>`);
  win.document.close();
  win.focus();
  win.print();
}

export default function CotisationParticipantsTable({
  cotisations,
  contactEmailByPlayerId,
  members,
  emptyLabel = "Aucune cotisation.",
}: {
  cotisations: AdminCotisation[];
  contactEmailByPlayerId: Record<string, string>;
  members: AdminMember[];
  emptyLabel?: string;
}) {
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusKey | "ALL">("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);

  const membersById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const [paymentIds, setPaymentIds] = useState<string[] | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState(paymentModes[0]);
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [remiseId, setRemiseId] = useState<string | null>(null);
  const [remiseAmount, setRemiseAmount] = useState("");
  const [remiseSaving, setRemiseSaving] = useState(false);

  const byId = useMemo(
    () => new Map(cotisations.map((c) => [c.id, c])),
    [cotisations]
  );

  const filtered = useMemo(() => {
    let list = cotisations;
    if (statusFilter !== "ALL") {
      list = list.filter((c) => computeStatus(c) === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => c.playerName.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => a.playerName.localeCompare(b.playerName, "fr"));
  }, [cotisations, statusFilter, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id));

  function toggleAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((c) => next.delete(c.id));
      else filtered.forEach((c) => next.add(c.id));
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openPayment(ids: string[]) {
    setActionError(null);
    setPaymentIds(ids);
    if (ids.length === 1) {
      const c = byId.get(ids[0]);
      const remaining = c ? Math.max(0, due(c) - (c.paiement ?? 0)) : 0;
      setPaymentAmount(String(remaining));
    } else {
      setPaymentAmount("");
    }
    setPaymentMode(paymentModes[0]);
  }

  async function confirmPayment() {
    if (!paymentIds) return;
    setPaymentSaving(true);
    setActionError(null);
    const supabase = createClient();

    if (paymentIds.length === 1) {
      const id = paymentIds[0];
      const c = byId.get(id);
      const amount = Number(paymentAmount);
      if (!c || Number.isNaN(amount)) {
        setPaymentSaving(false);
        return;
      }
      const newPaid = roundCents((c.paiement ?? 0) + amount);
      const newStatut = newPaid >= due(c) ? "PAYE" : "EN_ATTENTE";
      const { error } = await supabase
        .from("cotisations")
        .update({ paiement: newPaid, mode_paiement: paymentMode, statut: newStatut })
        .eq("id", id);
      if (error) {
        setPaymentSaving(false);
        setActionError(`Paiement impossible : ${error.message}`);
        return;
      }
    } else {
      const results = await Promise.all(
        paymentIds.map((id) => {
          const c = byId.get(id);
          const full = c ? due(c) : 0;
          return supabase
            .from("cotisations")
            .update({ paiement: full, mode_paiement: paymentMode, statut: "PAYE" })
            .eq("id", id);
        })
      );
      const err = results.find((r) => r.error)?.error;
      if (err) {
        setPaymentSaving(false);
        setActionError(`Paiement impossible : ${err.message}`);
        return;
      }
    }

    setPaymentSaving(false);
    setPaymentIds(null);
    setSelectedIds(new Set());
    router.refresh();
  }

  function openRemise(id: string) {
    setActionError(null);
    setRemiseId(id);
    const c = byId.get(id);
    setRemiseAmount(String(c?.remise ?? 0));
  }

  async function confirmRemise() {
    if (!remiseId) return;
    const amount = Number(remiseAmount);
    if (Number.isNaN(amount)) return;
    setRemiseSaving(true);
    setActionError(null);
    const supabase = createClient();
    const c = byId.get(remiseId);
    const paid = c?.paiement ?? 0;
    const newDue = Math.max(0, roundCents((c?.prix ?? 0) - amount));
    const newStatut = paid >= newDue ? "PAYE" : "EN_ATTENTE";
    const { error } = await supabase
      .from("cotisations")
      .update({ remise: amount, statut: newStatut })
      .eq("id", remiseId);
    setRemiseSaving(false);
    if (error) {
      setActionError(`Remise impossible : ${error.message}`);
      return;
    }
    setRemiseId(null);
    router.refresh();
  }

  function exportSelection(ids: string[]) {
    const items = cotisations.filter((c) => ids.includes(c.id));
    const header = [
      "Nom & Prénom",
      "Catégorie",
      "Type Adhésion",
      "Statut FBI",
      "Tarif",
      "Remise",
      "Payé",
      "Mode de Paiement",
      "Statut",
    ];
    const rows = items.map((c) => [
      c.playerName,
      c.category ?? "",
      c.membershipType ?? "",
      c.fbiStatus ?? "",
      c.prix ?? 0,
      c.remise ?? 0,
      c.paiement ?? 0,
      c.mode_paiement ?? "",
      statusBadge[computeStatus(c)].label,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotisations");
    XLSX.writeFile(wb, "cotisations-export.xlsx");
  }

  function relanceMailto(ids: string[]) {
    const emails = ids
      .map((id) => contactEmailByPlayerId[byId.get(id)?.playerId ?? ""])
      .filter((e): e is string => Boolean(e));
    if (emails.length === 0) return null;
    return `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(
      "UBAC 17 - Rappel de cotisation"
    )}&body=${encodeURIComponent(
      "Bonjour,\n\nNous vous rappelons qu'un règlement est encore attendu pour la cotisation en cours. Merci de régulariser votre situation auprès du Bureau.\n\nSportivement,\nUBAC 17"
    )}`;
  }

  const menuItemClass =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50";

  const selectedBulkMailto = relanceMailto(Array.from(selectedIds));

  return (
    <div className="flex flex-col gap-4">
      {actionError && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="shrink-0 rounded-full p-1 text-red-400 hover:bg-red-100 hover:text-red-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un membre..."
            className="w-full rounded-full border border-zinc-200 py-1.5 pl-9 pr-3 text-sm focus:border-ubac-yellow focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusKey | "ALL")}
          className="rounded-full border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700"
        >
          <option value="ALL">Tous les statuts</option>
          {(Object.keys(statusBadge) as StatusKey[]).map((k) => (
            <option key={k} value={k}>
              {statusBadge[k].label}
            </option>
          ))}
        </select>
        <span className="text-xs font-medium text-zinc-400">
          {filtered.length} ligne{filtered.length > 1 ? "s" : ""}
        </span>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ubac-yellow/40 bg-ubac-yellow/10 px-4 py-2.5">
          <span className="text-sm font-semibold text-ubac-yellow-dark">
            {selectedIds.size} sélectionné{selectedIds.size > 1 ? "s" : ""}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openPayment(Array.from(selectedIds))}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Marquer comme payé
            </button>
            <a
              href={selectedBulkMailto ?? undefined}
              aria-disabled={!selectedBulkMailto}
              className={`flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 ${
                !selectedBulkMailto ? "cursor-not-allowed opacity-50" : "hover:bg-zinc-50"
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              Relancer la sélection
            </a>
            <button
              onClick={() => exportSelection(Array.from(selectedIds))}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <FileText className="h-3.5 w-3.5" />
              Exporter (Excel)
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-white"
            >
              <X className="h-3.5 w-3.5" />
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="w-full overflow-x-auto rounded-2xl border border-zinc-100">
        <table className="w-full min-w-[700px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-10" />
            <col />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-24" />
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-10" />
          </colgroup>
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="px-2 py-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                />
              </th>
              <th className="px-2 py-2.5">Nom &amp; Prénom</th>
              <th className="px-2 py-2.5">Tarif</th>
              <th className="px-2 py-2.5">Remise</th>
              <th className="px-2 py-2.5">Payé</th>
              <th className="px-2 py-2.5">Mode Paiement</th>
              <th className="px-2 py-2.5">Statut</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const status = statusBadge[computeStatus(c)];
              const contactEmail = contactEmailByPlayerId[c.playerId] ?? null;
              return (
                <tr
                  key={c.id}
                  onClick={() => setDetailPlayerId(c.playerId)}
                  className="cursor-pointer border-b border-zinc-50 last:border-0 hover:bg-zinc-50/60"
                >
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                    />
                  </td>
                  <td className="truncate px-2 py-2 font-semibold text-zinc-900" title={c.playerName}>
                    {c.playerName}
                  </td>
                  <td className="px-2 py-2 text-zinc-600">{formatAmount(c.prix)}</td>
                  <td className="px-2 py-2 text-zinc-600">{formatAmount(c.remise)}</td>
                  <td className="px-2 py-2 text-zinc-600">{formatAmount(c.paiement)}</td>
                  <td className="truncate px-2 py-2 text-zinc-600" title={c.mode_paiement ?? undefined}>
                    {c.mode_paiement ?? "—"}
                  </td>
                  <td className="px-2 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="relative px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
                      className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {openMenuId === c.id && (
                      <>
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setOpenMenuId(null)}
                        />
                        <div className="absolute right-0 z-40 mt-1 w-60 rounded-xl border border-zinc-100 bg-white p-1.5 text-left shadow-lg">
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              setDetailPlayerId(c.playerId);
                            }}
                            className={menuItemClass}
                          >
                            <Contact className="h-3.5 w-3.5" />
                            Voir la fiche membre
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              openPayment([c.id]);
                            }}
                            className={menuItemClass}
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Enregistrer un paiement
                          </button>
                          {contactEmail ? (
                            <a
                              href={relanceMailto([c.id]) ?? undefined}
                              onClick={() => setOpenMenuId(null)}
                              className={menuItemClass}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Envoyer une relance
                            </a>
                          ) : (
                            <span
                              title="Aucun contact connu"
                              className={`${menuItemClass} cursor-not-allowed text-zinc-300 hover:bg-transparent`}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Envoyer une relance
                            </span>
                          )}
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              openRemise(c.id);
                            }}
                            className={menuItemClass}
                          >
                            <Percent className="h-3.5 w-3.5" />
                            Appliquer une remise
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              openReceiptWindow(c, contactEmail);
                            }}
                            className={menuItemClass}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            Générer reçu / facture
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-2 py-8 text-center text-sm text-zinc-400">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {paymentIds && (
        <Modal
          title={
            paymentIds.length === 1
              ? `Enregistrer un paiement — ${byId.get(paymentIds[0])?.playerName ?? ""}`
              : `Marquer comme payé (${paymentIds.length} membres)`
          }
          onClose={() => setPaymentIds(null)}
        >
          <div className="flex flex-col gap-2">
            {paymentIds.length === 1 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Montant (€)
                </label>
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Mode de paiement
              </label>
              <select
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              >
                {paymentModes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            {paymentIds.length > 1 && (
              <p className="text-xs text-zinc-500">
                Le solde restant dû de chaque membre sélectionné sera réglé en
                intégralité avec ce mode de paiement.
              </p>
            )}
            <button
              onClick={confirmPayment}
              disabled={paymentSaving}
              className="mt-1 rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {paymentSaving ? "Enregistrement..." : "Confirmer"}
            </button>
          </div>
        </Modal>
      )}

      {remiseId && (
        <Modal
          title={`Appliquer une remise — ${byId.get(remiseId)?.playerName ?? ""}`}
          onClose={() => setRemiseId(null)}
        >
          <div className="flex flex-col gap-2">
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Montant de la remise (€)
            </label>
            <input
              type="number"
              value={remiseAmount}
              onChange={(e) => setRemiseAmount(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
            />
            <button
              onClick={confirmRemise}
              disabled={remiseSaving}
              className="mt-1 rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {remiseSaving ? "Enregistrement..." : "Confirmer"}
            </button>
          </div>
        </Modal>
      )}

      {detailPlayerId &&
        (() => {
          const detailMember = membersById.get(detailPlayerId);
          if (!detailMember) return null;
          return (
            <MemberDetailModal
              member={detailMember}
              readOnly={false}
              onClose={() => setDetailPlayerId(null)}
            />
          );
        })()}
    </div>
  );
}
