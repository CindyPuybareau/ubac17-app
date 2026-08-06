"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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

type StatusKey = "PAYE" | "PARTIEL" | "OFFERT" | "EN_ATTENTE";

const statusBadge: Record<StatusKey, { label: string; className: string }> = {
  PAYE: { label: "Payé", className: "bg-green-100 text-green-700" },
  PARTIEL: { label: "Partiel", className: "bg-orange-100 text-orange-700" },
  OFFERT: { label: "Offert", className: "bg-amber-100 text-amber-700" },
  EN_ATTENTE: { label: "En attente", className: "bg-red-100 text-red-700" },
};

const paymentModes = [
  "Chèque",
  "Espèces",
  "Pass Sport / ANCV",
  "TPE / CB (SumUp)",
  "HelloAsso",
  "Virement",
  "Autre",
];

export function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

function due(c: AdminCotisation) {
  return Math.max(0, roundCents((c.prix ?? 0) - (c.remise ?? 0)));
}

// Same "NOM" convention as the Membres table: last name shown fully
// uppercase, falling back to the free-text playerName when a cotisation's
// player row doesn't carry split first/last name fields (older imports).
function cotisationLastName(c: AdminCotisation) {
  return (c.lastName ?? "").toUpperCase() || c.playerName || "—";
}

function cotisationFirstName(c: AdminCotisation) {
  return c.firstName ?? "—";
}

export function balanceDue(c: AdminCotisation) {
  return Math.max(0, roundCents(due(c) - (c.paiement ?? 0)));
}

// Always derived live from the amounts — Payé (solde <= 0), Partiel (au
// moins un versement mais solde > 0), En attente (rien versé) — except
// "Offert" which stays a manual override from the club's own import/
// designation (dirigeant, coach...): that's not an amount concept, so it
// can never be derived and always wins regardless of what's been paid.
export function computeStatus(c: AdminCotisation): StatusKey {
  if (c.statut === "OFFERT") return "OFFERT";
  const d = due(c);
  const paid = c.paiement ?? 0;
  if (d <= 0 || paid >= d) return "PAYE";
  if (paid > 0) return "PARTIEL";
  return "EN_ATTENTE";
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
  const paymentsRows = [...c.payments]
    .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime())
    .map(
      (p) =>
        `<tr><td>${new Date(p.paidAt).toLocaleDateString("fr-FR")}</td><td>${p.mode}</td><td>${p.detail ?? "—"}</td><td>${formatAmount(p.amount)}</td></tr>`
    )
    .join("");
  win.document.write(`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Reçu - ${c.playerName}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 40px; color: #18181b; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  h2 { font-size: 13px; text-transform: uppercase; color: #71717a; margin: 24px 0 4px; }
  .muted { color: #71717a; font-size: 13px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td, th { padding: 8px 0; border-bottom: 1px solid #e4e4e7; text-align: left; font-size: 14px; }
  th { color: #71717a; text-transform: uppercase; font-size: 11px; }
  .total { font-weight: 700; font-size: 16px; }
</style>
</head>
<body>
  <h1>UBAC — Union Basket Angoulins Châtelaillon</h1>
  <p class="muted">Reçu / Facture — ${c.collecteName ?? `Cotisation ${c.saison}`}</p>
  <table>
    <tr><th>Membre</th><td>${c.playerName}</td></tr>
    <tr><th>Catégorie</th><td>${c.category ?? "—"}</td></tr>
    ${c.membershipType ? `<tr><th>Type d'adhésion</th><td>${c.membershipType}</td></tr>` : ""}
    ${contactEmail ? `<tr><th>Contact</th><td>${contactEmail}</td></tr>` : ""}
    <tr><th>Tarif</th><td>${formatAmount(c.prix)}</td></tr>
    <tr><th>Remise</th><td>${formatAmount(c.remise)}</td></tr>
    <tr><th>Total versé</th><td>${formatAmount(c.paiement)}</td></tr>
    <tr><th>Statut</th><td>${status.label}</td></tr>
  </table>
  ${
    paymentsRows
      ? `<h2>Détail des règlements</h2>
  <table>
    <tr><th>Date</th><th>Mode</th><th>Détail</th><th>Montant</th></tr>
    ${paymentsRows}
  </table>`
      : ""
  }
  <p class="total" style="margin-top:16px;">Solde restant dû : ${formatAmount(balanceDue(c))}</p>
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
  const [sortKey, setSortKey] = useState<"lastName" | "firstName">("lastName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [detailPlayerId, setDetailPlayerId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [relanceSending, setRelanceSending] = useState(false);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  const membersById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const [paymentIds, setPaymentIds] = useState<string[] | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState(paymentModes[0]);
  const [paymentDetail, setPaymentDetail] = useState("");
  const [paymentExpectedCashDate, setPaymentExpectedCashDate] = useState("");
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
    const key = sortKey === "lastName" ? cotisationLastName : cotisationFirstName;
    return [...list].sort((a, b) => {
      const cmp = key(a).localeCompare(key(b), "fr");
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [cotisations, statusFilter, search, sortKey, sortDir]);

  function toggleSort(key: "lastName" | "firstName") {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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
      setPaymentAmount(c ? String(balanceDue(c)) : "");
    } else {
      setPaymentAmount("");
    }
    setPaymentMode(paymentModes[0]);
    setPaymentDetail("");
    setPaymentExpectedCashDate("");
  }

  async function confirmPayment() {
    if (!paymentIds) return;
    setPaymentSaving(true);
    setActionError(null);
    const supabase = createClient();

    if (paymentIds.length === 1) {
      // Single dossier: append one more règlement to its history instead of
      // overwriting the total — this is what lets a member's cotisation be
      // settled across several chèques/modes over time (Chèque 1, Chèque 2,
      // Pass Sport...) with each one kept as its own record.
      const id = paymentIds[0];
      const c = byId.get(id);
      const amount = Number(paymentAmount);
      if (!c || Number.isNaN(amount) || amount <= 0) {
        setPaymentSaving(false);
        setActionError("Montant invalide.");
        return;
      }
      const { error: paymentError } = await supabase.from("cotisation_payments").insert({
        cotisation_id: id,
        amount,
        mode: paymentMode,
        detail: paymentDetail || null,
        expected_cash_date: paymentExpectedCashDate || null,
      });
      if (paymentError) {
        setPaymentSaving(false);
        setActionError(`Paiement impossible : ${paymentError.message}`);
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
      // Bulk "Marquer comme payé" still settles each dossier in full with a
      // single mode, but now also logs that settlement as a payment record
      // so it shows up in each member's history like any other règlement.
      const results = await Promise.all(
        paymentIds.map(async (id) => {
          const c = byId.get(id);
          if (!c) return { error: null };
          const remaining = balanceDue(c);
          if (remaining > 0) {
            const { error: paymentError } = await supabase.from("cotisation_payments").insert({
              cotisation_id: id,
              amount: remaining,
              mode: paymentMode,
            });
            if (paymentError) return { error: paymentError };
          }
          return supabase
            .from("cotisations")
            .update({ paiement: due(c), mode_paiement: paymentMode, statut: "PAYE" })
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
    setPaymentDetail("");
    setPaymentExpectedCashDate("");
    setSelectedIds(new Set());
    showToast("Paiement enregistré.");
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
      "Solde restant",
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
      balanceDue(c),
      c.mode_paiement ?? "",
      statusBadge[computeStatus(c)].label,
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cotisations");
    XLSX.writeFile(wb, "cotisations-export.xlsx");
  }

  function relanceBody(c: AdminCotisation) {
    const lines = [
      "Bonjour,",
      "",
      "Nous vous rappelons qu'un règlement est encore attendu pour la cotisation en cours :",
      "",
      `Membre : ${c.playerName}`,
      `Tarif : ${formatAmount(c.prix)}`,
      c.remise ? `Remise : ${formatAmount(c.remise)}` : null,
      `Montant versé : ${formatAmount(c.paiement)}`,
      `Solde restant dû : ${formatAmount(balanceDue(c))}`,
      "",
      "Merci de régulariser votre situation auprès du Bureau dès que possible.",
      "",
      "Sportivement,",
      "UBAC",
    ].filter((l): l is string => l !== null);
    return lines.join("\n");
  }

  async function sendRelance(ids: string[]) {
    const targets = ids
      .map((id) => byId.get(id))
      .filter((c): c is AdminCotisation => Boolean(c))
      .map((c) => ({ c, email: contactEmailByPlayerId[c.playerId] ?? null }))
      .filter((t): t is { c: AdminCotisation; email: string } => Boolean(t.email));

    if (targets.length === 0) {
      setActionError("Aucun contact connu pour envoyer une relance.");
      return;
    }

    setRelanceSending(true);
    setActionError(null);
    const results = await Promise.all(
      targets.map(async ({ c, email }) => {
        try {
          const res = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              subject: "UBAC - Rappel de cotisation",
              body: relanceBody(c),
            }),
          });
          return res.ok;
        } catch {
          return false;
        }
      })
    );
    setRelanceSending(false);
    const successCount = results.filter(Boolean).length;
    if (successCount > 0) {
      showToast(
        `${successCount} relance${successCount > 1 ? "s" : ""} envoyée${successCount > 1 ? "s" : ""}.`
      );
    }
    if (successCount < targets.length) {
      setActionError(
        `${targets.length - successCount} relance(s) n'ont pas pu être envoyées.`
      );
    }
    setSelectedIds(new Set());
  }

  const menuItemClass =
    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50";

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
            <button
              onClick={() => sendRelance(Array.from(selectedIds))}
              disabled={relanceSending}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              <Mail className="h-3.5 w-3.5" />
              {relanceSending ? "Envoi..." : "Relancer la sélection"}
            </button>
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

      <div className="w-full overflow-x-auto rounded-2xl border border-t-4 border-zinc-100 border-t-ubac-yellow">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="whitespace-nowrap px-3 py-3">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                />
              </th>
              <th
                className="w-auto cursor-pointer select-none whitespace-nowrap px-3 py-3"
                onClick={() => toggleSort("lastName")}
              >
                <span className="flex items-center gap-1 whitespace-nowrap">
                  Nom
                  {sortKey === "lastName" &&
                    (sortDir === "asc" ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ))}
                </span>
              </th>
              <th
                className="w-auto cursor-pointer select-none whitespace-nowrap px-3 py-3"
                onClick={() => toggleSort("firstName")}
              >
                <span className="flex items-center gap-1 whitespace-nowrap">
                  Prénom
                  {sortKey === "firstName" &&
                    (sortDir === "asc" ? (
                      <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    ))}
                </span>
              </th>
              <th className="whitespace-nowrap px-3 py-3">Tarif</th>
              <th className="whitespace-nowrap px-3 py-3">Remise</th>
              <th className="whitespace-nowrap px-3 py-3">Payé</th>
              <th className="whitespace-nowrap px-3 py-3">Solde restant</th>
              <th className="whitespace-nowrap px-3 py-3">Mode Paiement</th>
              <th className="whitespace-nowrap px-3 py-3">Statut</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, index) => {
              const status = statusBadge[computeStatus(c)];
              const contactEmail = contactEmailByPlayerId[c.playerId] ?? null;
              return (
                <tr
                  key={c.id}
                  onClick={() => setDetailPlayerId(c.playerId)}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 transition-colors duration-150 hover:bg-amber-50/40 ${
                    index % 2 === 1 ? "bg-slate-50/50" : ""
                  }`}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                    />
                  </td>
                  <td className="w-auto whitespace-nowrap px-3 py-3 font-semibold text-zinc-900">
                    {cotisationLastName(c)}
                  </td>
                  <td className="w-auto whitespace-nowrap px-3 py-3 text-zinc-700">
                    {cotisationFirstName(c)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-600">{formatAmount(c.prix)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-600">{formatAmount(c.remise)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-600">{formatAmount(c.paiement)}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-zinc-900">
                    {formatAmount(balanceDue(c))}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-zinc-600">
                    {c.mode_paiement ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="relative px-3 py-3" onClick={(e) => e.stopPropagation()}>
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
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                sendRelance([c.id]);
                              }}
                              disabled={relanceSending}
                              className={`${menuItemClass} disabled:opacity-60`}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Envoyer une relance
                            </button>
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
                <td colSpan={10} className="px-2 py-8 text-center text-sm text-zinc-400">
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
          <div className="flex flex-col gap-3">
            {paymentIds.length === 1 &&
              (() => {
                const c = byId.get(paymentIds[0]);
                if (!c || c.payments.length === 0) return null;
                const history = [...c.payments].sort(
                  (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
                );
                return (
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2">
                    <p className="mb-1 text-xs font-semibold text-zinc-500">
                      Règlements déjà enregistrés
                    </p>
                    <ul className="flex flex-col gap-1">
                      {history.map((p) => (
                        <li key={p.id} className="flex items-center justify-between text-xs text-zinc-600">
                          <span>
                            {new Date(p.paidAt).toLocaleDateString("fr-FR")} — {p.mode}
                            {p.detail ? ` (${p.detail})` : ""}
                          </span>
                          <span className="font-semibold text-zinc-800">{formatAmount(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-xs font-semibold text-zinc-700">
                      Solde restant dû : {formatAmount(balanceDue(c))}
                    </p>
                  </div>
                );
              })()}
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
            {paymentIds.length === 1 && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    Détail (n° chèque, banque...)
                  </label>
                  <input
                    type="text"
                    value={paymentDetail}
                    onChange={(e) => setPaymentDetail(e.target.value)}
                    placeholder="Optionnel"
                    className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">
                    Date d&apos;encaissement prévue
                  </label>
                  <input
                    type="date"
                    value={paymentExpectedCashDate}
                    onChange={(e) => setPaymentExpectedCashDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                  />
                </div>
              </>
            )}
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

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full bg-navy px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          {toast}
        </div>
      )}
    </div>
  );
}
