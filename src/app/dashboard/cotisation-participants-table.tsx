"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CreditCard,
  FileText,
  Lightbulb,
  Mail,
  MoreVertical,
  Paperclip,
  Pencil,
  Percent,
  Receipt,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildGmailComposeLink, signatureIndex, withSignature } from "@/lib/email";
import {
  balanceDue,
  computeStatus,
  cotisationFirstName,
  cotisationLastName,
  due,
  formatAmount,
  relanceTemplateKeyFor,
  renderRelanceTemplate,
  roundCents,
  RELANCE_TEMPLATES,
  type RelanceTemplateKey,
  type StatusKey,
} from "./cotisation-shared";
import type { AdminCotisation, CotisationPayment } from "./page";
import ConfirmDialog from "./confirm-dialog";

// Ré-exportées : plusieurs écrans importent encore ces fonctions d'ici par
// habitude (family-cotisation-card.tsx, cotisations-manager.tsx) — inutile
// de leur faire pointer vers cotisation-shared.ts un par un tant que ça
// marche déjà.
export { balanceDue, computeStatus, due, formatAmount, roundCents };

// Palette de marque (direction artistique validée par Cindy le 2026-08-23)
// plutôt que des teintes Tailwind au hasard — mais "En attente" reste un
// signal d'alerte (corail, pas l'or de marque) : l'or est déjà utilisé
// comme accent positif partout ailleurs dans l'appli, le réutiliser ici
// aurait dilué le repère visuel "il manque un paiement" que le Bureau
// scanne d'un coup d'œil sur 95 fiches.
const statusBadge: Record<StatusKey, { label: string; className: string }> = {
  PAYE: { label: "Payé", className: "bg-court-green/10 text-court-green" },
  PARTIEL: { label: "Partiel", className: "bg-parquet/15 text-parquet-dark" },
  OFFERT: { label: "Offert", className: "bg-navy/10 text-navy" },
  EN_ATTENTE: { label: "En attente", className: "bg-coral/15 text-coral-dark" },
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

function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`w-full ${wide ? "max-w-lg" : "max-w-sm"} rounded-2xl bg-white p-5 shadow-xl`}>
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

// The line auto-appended to a relance's body when the "Joindre la
// facture..." checkbox is on — kept as a single constant so toggling the
// checkbox can reliably add/remove it again without leaving stray copies.
export const RECEIPT_ATTACHMENT_MENTION =
  "Vous trouverez votre attestation / facture de cotisation ci-jointe au format PDF.";

export function withReceiptMention(body: string, attach: boolean) {
  const hasMention = body.includes(RECEIPT_ATTACHMENT_MENTION);
  if (attach === hasMention) return withSignature(body);
  if (!attach) {
    return withSignature(
      body
        .replace(`${RECEIPT_ATTACHMENT_MENTION}\n\n`, "")
        .replace(`\n\n${RECEIPT_ATTACHMENT_MENTION}`, "")
        .replace(RECEIPT_ATTACHMENT_MENTION, "")
    );
  }
  // The mention belongs to the message, so it goes above the signature
  // rather than after it — otherwise ticking the checkbox would push a
  // stray line below "L'équipe UBAC".
  const signed = withSignature(body);
  const sigAt = signatureIndex(signed);
  const intro = signed.slice(0, sigAt).trimEnd();
  const signature = signed.slice(sigAt);
  return intro
    ? `${intro}\n\n${RECEIPT_ATTACHMENT_MENTION}\n\n${signature}`
    : `${RECEIPT_ATTACHMENT_MENTION}\n\n${signature}`;
}

// Same content as openReceiptWindow's printable page, laid out as an
// actual PDF (via jsPDF, pure client-side, no server round-trip) so it can
// be attached to a relance/confirmation email. Title reflects the same
// "Reçu / Facture acquittée" vs "Appel de cotisation" distinction the
// ticket asks for, driven by whether anything is still due.
function buildReceiptPdfBase64(c: AdminCotisation, contactEmail: string | null) {
  const balance = balanceDue(c);
  const isSettled = balance <= 0;
  const title = isSettled ? "Reçu / Facture acquittée" : "Appel de cotisation";
  const status = statusBadge[computeStatus(c)];

  const doc = new jsPDF();
  let y = 20;

  doc.setFontSize(16);
  doc.text("UBAC — Union Basket Angoulins Châtelaillon", 14, y);
  y += 8;
  doc.setFontSize(12);
  doc.text(`${title} — ${c.collecteName ?? `Cotisation ${c.saison}`}`, 14, y);
  y += 10;

  doc.setFontSize(10);
  const row = (label: string, value: string) => {
    doc.text(`${label} :`, 14, y);
    doc.text(value, 65, y);
    y += 7;
  };
  row("Membre", c.playerName);
  if (c.category) row("Catégorie", c.category);
  if (c.membershipType) row("Type d'adhésion", c.membershipType);
  if (contactEmail) row("Contact", contactEmail);
  row("Tarif", formatAmount(c.prix));
  row("Remise", formatAmount(c.remise));
  row("Total versé", formatAmount(c.paiement));
  row("Statut", status.label);

  if (c.payments.length > 0) {
    y += 3;
    doc.setFontSize(11);
    doc.text("Détail des règlements", 14, y);
    y += 7;
    doc.setFontSize(10);
    [...c.payments]
      .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime())
      .forEach((p) => {
        const label = `${new Date(p.paidAt).toLocaleDateString("fr-FR")} — ${p.mode}${p.detail ? ` (${p.detail})` : ""}`;
        doc.text(label, 14, y);
        doc.text(formatAmount(p.amount), 160, y);
        y += 6;
      });
    y += 4;
  }

  y += 4;
  doc.setFontSize(12);
  doc.text(`Solde restant dû : ${formatAmount(balance)}`, 14, y);

  const dataUri = doc.output("datauristring");
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const safeName = `${cotisationLastName(c)}-${cotisationFirstName(c)}`.replace(/[^a-zA-Z0-9-]+/g, "_");
  const filename = `${isSettled ? "recu" : "appel-cotisation"}-${safeName}.pdf`;
  return { base64, filename };
}

// Manual fallback only: a web page can't slip a file into a Gmail/Outlook
// draft (browser + provider security boundary), so when no mail service is
// configured the PDF is dropped in the user's Downloads for them to drag
// into the draft that opens alongside.
function downloadReceiptPdf(c: AdminCotisation, contactEmail: string | null) {
  const { base64, filename } = buildReceiptPdfBase64(c, contactEmail);
  const link = document.createElement("a");
  link.href = `data:application/pdf;base64,${base64}`;
  link.download = filename;
  link.click();
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
  emptyLabel = "Aucune cotisation.",
}: {
  cotisations: AdminCotisation[];
  contactEmailByPlayerId: Record<string, string>;
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
  const [clearRemiseTarget, setClearRemiseTarget] = useState<string | null>(null);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<
    { paymentId: string; cotisationId: string } | null
  >(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null
  );
  const [relanceSending, setRelanceSending] = useState(false);
  const [relancePreview, setRelancePreview] = useState<{
    ids: string[];
    subject: string;
    body: string;
    attachReceipt: boolean;
  } | null>(null);
  // null while unknown/loading — the modal optimistically shows the direct
  // send button until the answer comes back, so nothing flickers.
  const [mailServiceConfigured, setMailServiceConfigured] = useState<boolean | null>(null);
  const [manualNotice, setManualNotice] = useState<string | null>(null);

  function showToast(message: string) {
    setToast({ message, variant: "success" });
    setTimeout(() => setToast(null), 4000);
  }

  // Failures carry actionable setup info ("renseigner RESEND_API_KEY"...),
  // so they stay up noticeably longer than a success confirmation.
  function showErrorToast(message: string) {
    setToast({ message, variant: "error" });
    setTimeout(() => setToast(null), 9000);
  }

  const [paymentIds, setPaymentIds] = useState<string[] | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState(paymentModes[0]);
  const [paymentDetail, setPaymentDetail] = useState("");
  const [paymentExpectedCashDate, setPaymentExpectedCashDate] = useState("");
  const [paymentSaving, setPaymentSaving] = useState(false);

  const [remiseId, setRemiseId] = useState<string | null>(null);
  const [remiseAmount, setRemiseAmount] = useState("");
  const [remiseSaving, setRemiseSaving] = useState(false);

  const [editPayment, setEditPayment] = useState<{
    id: string;
    cotisationId: string;
    amount: string;
    mode: string;
    detail: string;
    paidAt: string;
    expectedCashDate: string;
  } | null>(null);
  const [editPaymentSaving, setEditPaymentSaving] = useState(false);

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

      // Deliberately don't close the modal here: the whole point of this
      // dossier-level flow is to let several règlements (Chèque 1, Chèque
      // 2, Pass Sport...) be recorded back-to-back without reopening
      // "Enregistrer un paiement" each time. Reset the form to the
      // just-computed remaining balance (not read from props — those won't
      // reflect this payment until router.refresh()'s data lands) so the
      // next entry is immediately ready.
      const newRemaining = Math.max(0, roundCents(due(c) - newPaid));
      setPaymentSaving(false);
      setPaymentAmount(String(newRemaining));
      setPaymentMode(paymentModes[0]);
      setPaymentDetail("");
      setPaymentExpectedCashDate("");
      showToast("Règlement ajouté.");
      router.refresh();
      return;
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

  // Confirmation déplacée dans clearRemiseTarget + le <ConfirmDialog>
  // rendu plus bas — retour de Cindy du 2026-08-21 : window.confirm()
  // affiche le chrome du navigateur, impossible à styler pour ressembler
  // à l'appli.
  async function clearRemise(id: string) {
    setClearRemiseTarget(null);
    setActionError(null);
    const supabase = createClient();
    const c = byId.get(id);
    const paid = c?.paiement ?? 0;
    const newDue = Math.max(0, roundCents(c?.prix ?? 0));
    const newStatut = paid >= newDue ? "PAYE" : "EN_ATTENTE";
    const { error } = await supabase
      .from("cotisations")
      .update({ remise: 0, statut: newStatut })
      .eq("id", id);
    if (error) {
      setActionError(`Suppression de la remise impossible : ${error.message}`);
      return;
    }
    showToast("Remise supprimée.");
    router.refresh();
  }

  // After editing or deleting a règlement, cotisations.paiement/mode_paiement
  // (and statut, unless it's a manual "Offert") are re-derived from the
  // authoritative source — every remaining cotisation_payments row for this
  // dossier — rather than incrementally patched, so a correction always
  // lands on the exact right total regardless of which payment was touched.
  async function recomputeCotisationTotals(cotisationId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("cotisation_payments")
      .select("amount, mode, paid_at")
      .eq("cotisation_id", cotisationId)
      .order("paid_at", { ascending: false });
    if (error) {
      setActionError(`Recalcul du solde impossible : ${error.message}`);
      return;
    }
    const rows = data ?? [];
    const total = roundCents(rows.reduce((sum, p) => sum + (p.amount ?? 0), 0));
    const c = byId.get(cotisationId);
    const newDue = c ? due(c) : 0;
    const update: { paiement: number; mode_paiement: string | null; statut?: string } = {
      paiement: total,
      mode_paiement: rows[0]?.mode ?? null,
    };
    // Never silently clear a manual "Offert" override — it isn't an amount
    // concept, so a payment correction shouldn't be able to undo it.
    if (c?.statut !== "OFFERT") {
      update.statut = total >= newDue ? "PAYE" : "EN_ATTENTE";
    }
    const { error: updateError } = await supabase
      .from("cotisations")
      .update(update)
      .eq("id", cotisationId);
    if (updateError) {
      setActionError(`Recalcul du solde impossible : ${updateError.message}`);
    }
  }

  function openEditPayment(cotisationId: string, p: CotisationPayment) {
    setActionError(null);
    setEditPayment({
      id: p.id,
      cotisationId,
      amount: String(p.amount),
      mode: p.mode,
      detail: p.detail ?? "",
      paidAt: p.paidAt.slice(0, 10),
      expectedCashDate: p.expectedCashDate ?? "",
    });
  }

  async function confirmEditPayment() {
    if (!editPayment) return;
    const amount = Number(editPayment.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      setActionError("Montant invalide.");
      return;
    }
    setEditPaymentSaving(true);
    setActionError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("cotisation_payments")
      .update({
        amount,
        mode: editPayment.mode,
        detail: editPayment.detail || null,
        paid_at: editPayment.paidAt
          ? new Date(`${editPayment.paidAt}T12:00:00`).toISOString()
          : new Date().toISOString(),
        expected_cash_date: editPayment.expectedCashDate || null,
      })
      .eq("id", editPayment.id);
    if (error) {
      setEditPaymentSaving(false);
      setActionError(`Modification impossible : ${error.message}`);
      return;
    }
    await recomputeCotisationTotals(editPayment.cotisationId);
    setEditPaymentSaving(false);
    setEditPayment(null);
    showToast("Règlement modifié.");
    router.refresh();
  }

  // Même correctif que clearRemise ci-dessus.
  async function deletePayment(paymentId: string, cotisationId: string) {
    setDeletePaymentTarget(null);
    setActionError(null);
    const supabase = createClient();
    const { error } = await supabase.from("cotisation_payments").delete().eq("id", paymentId);
    if (error) {
      setActionError(`Suppression impossible : ${error.message}`);
      return;
    }
    await recomputeCotisationTotals(cotisationId);
    showToast("Règlement supprimé.");
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

  // Opens the editable preview instead of sending straight away. Single
  // recipient: prefill with that member's own template, fully rendered
  // (what the Bureau sees is exactly what gets sent). Multiple recipients:
  // prefill with the shared template if every selected cotisation has the
  // same status, otherwise fall back to the "En attente" wording (the most
  // common relance reason) — the {prenom}/{nom}/{tarif}/{paye}/{solde}
  // placeholders stay literal in the textarea and are only resolved per
  // recipient at send time, since a single rendered preview can't
  // represent several different people's amounts at once.
  function openRelancePreview(ids: string[]) {
    const targets = ids
      .map((id) => byId.get(id))
      .filter((c): c is AdminCotisation => Boolean(c));
    if (targets.length === 0) return;
    setActionError(null);
    setManualNotice(null);

    fetch("/api/send-email")
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => setMailServiceConfigured(Boolean(d?.configured)))
      .catch(() => setMailServiceConfigured(false));

    if (targets.length === 1) {
      const c = targets[0];
      const tpl = RELANCE_TEMPLATES[relanceTemplateKeyFor(c)];
      setRelancePreview({
        ids,
        subject: renderRelanceTemplate(tpl.subject, c),
        body: withReceiptMention(renderRelanceTemplate(tpl.body, c), true),
        attachReceipt: true,
      });
    } else {
      const keys = new Set(targets.map(relanceTemplateKeyFor));
      const key: RelanceTemplateKey = keys.size === 1 ? [...keys][0] : "EN_ATTENTE";
      const tpl = RELANCE_TEMPLATES[key];
      setRelancePreview({
        ids,
        subject: tpl.subject,
        body: withReceiptMention(tpl.body, true),
        attachReceipt: true,
      });
    }
  }

  async function confirmSendRelance() {
    if (!relancePreview) return;
    const { ids, subject, body, attachReceipt } = relancePreview;
    const targets = ids
      .map((id) => byId.get(id))
      .filter((c): c is AdminCotisation => Boolean(c))
      .map((c) => ({ c, email: contactEmailByPlayerId[c.playerId] ?? null }))
      .filter((t): t is { c: AdminCotisation; email: string } => Boolean(t.email));

    if (targets.length === 0) {
      setActionError("Aucun contact connu pour envoyer un message.");
      return;
    }

    // Single recipient: the textarea already holds the final, fully
    // rendered text (possibly hand-edited) — send it verbatim. Several
    // recipients: the textarea holds the shared template, still with
    // placeholders — resolve them individually for each person here. The
    // PDF attachment is always built per recipient (each person's own
    // reçu/appel), never a single shared file.
    const isBulk = targets.length > 1;
    setRelanceSending(true);
    setActionError(null);
    const results = await Promise.all(
      targets.map(async ({ c, email }) => {
        try {
          const attachment = attachReceipt
            ? buildReceiptPdfBase64(c, contactEmailByPlayerId[c.playerId] ?? null)
            : null;
          const res = await fetch("/api/send-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: email,
              subject: isBulk ? renderRelanceTemplate(subject, c) : subject,
              // withSignature is applied last, on the final text: a body
              // the Bureau rewrote from scratch in the textarea still
              // leaves signed by the club.
              body: withSignature(isBulk ? renderRelanceTemplate(body, c) : body),
              ...(attachment
                ? { attachmentBase64: attachment.base64, attachmentFilename: attachment.filename }
                : {}),
            }),
          });
          // The API always answers with JSON — either {success:true} or
          // {error:"..."} with the exact reason (missing env vars, Gmail
          // auth failure, etc.). Always read it instead of trusting
          // res.ok alone, so a real failure surfaces its real cause
          // instead of a generic "couldn't send" with no way to diagnose it.
          let data: { error?: string } = {};
          try {
            data = await res.json();
          } catch {
            // No JSON body — a network-level failure, handled below.
          }
          return { ok: res.ok, email, error: data.error };
        } catch (err) {
          return {
            ok: false,
            email,
            error: err instanceof Error ? err.message : "Connexion au serveur impossible.",
          };
        }
      })
    );
    setRelanceSending(false);
    const successes = results.filter((r) => r.ok);
    const failures = results.filter((r) => !r.ok);
    const withAttachment = attachReceipt ? " avec la facture en pièce jointe" : "";
    if (successes.length === 1 && failures.length === 0) {
      showToast(`Email envoyé avec succès à ${successes[0].email}${withAttachment}.`);
    } else if (successes.length > 0) {
      showToast(
        `${successes.length} mail${successes.length > 1 ? "s" : ""} envoyé${successes.length > 1 ? "s" : ""} avec succès${withAttachment}.`
      );
    }
    if (failures.length > 0) {
      const firstError = failures[0].error ?? "Erreur inconnue.";
      showErrorToast(
        failures.length === 1
          ? `Envoi à ${failures[0].email} impossible : ${firstError}`
          : `${failures.length} mail(s) non envoyés : ${firstError}`
      );
    }
    setSelectedIds(new Set());
    setRelancePreview(null);
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
            className="w-full rounded-full border border-zinc-200 bg-white py-1.5 pl-9 pr-3 text-sm focus:border-ubac-yellow focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusKey | "ALL")}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-700"
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
              onClick={() => openRelancePreview(Array.from(selectedIds))}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              <Mail className="h-3.5 w-3.5" />
              Relancer la sélection
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

      <div className="w-full overflow-x-auto rounded-2xl border border-l-4 border-zinc-100 border-l-ubac-yellow bg-white">
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
            {filtered.map((c) => {
              const status = statusBadge[computeStatus(c)];
              const contactEmail = contactEmailByPlayerId[c.playerId] ?? null;
              return (
                <tr
                  key={c.id}
                  onClick={() => openPayment([c.id])}
                  className={`cursor-pointer border-b border-slate-100 last:border-0 transition-colors duration-150 hover:bg-amber-50/40 ${
                    // Zébrage retiré (direction artistique du 2026-08-23,
                    // "fond blanc") : en semi-transparence il laissait le
                    // fond crème de la page passer au travers des lignes
                    // impaires, viré au beige au lieu du gris attendu.
                    ""
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
                        <div className="absolute right-0 z-40 mt-1 w-64 rounded-xl border border-zinc-100 bg-white p-1.5 text-left shadow-lg">
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              openPayment([c.id]);
                            }}
                            className={menuItemClass}
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                            Suivi/enregistrer paiement
                          </button>
                          {contactEmail ? (
                            <button
                              onClick={() => {
                                setOpenMenuId(null);
                                openRelancePreview([c.id]);
                              }}
                              className={menuItemClass}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Envoyer une relance / un mail
                            </button>
                          ) : (
                            <span
                              title="Aucun contact connu"
                              className={`${menuItemClass} cursor-not-allowed text-zinc-300 hover:bg-transparent`}
                            >
                              <Mail className="h-3.5 w-3.5" />
                              Envoyer une relance / un mail
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
              ? `Cotisation & Paiements — ${byId.get(paymentIds[0])?.playerName ?? ""}`
              : `Marquer comme payé (${paymentIds.length} membres)`
          }
          onClose={() => setPaymentIds(null)}
        >
          <div className="flex flex-col gap-3">
            {paymentIds.length === 1 &&
              (() => {
                const c = byId.get(paymentIds[0]);
                if (!c) return null;
                const contactEmail = contactEmailByPlayerId[c.playerId] ?? null;
                return (
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-2 text-xs text-zinc-600">
                    <div className="flex items-center justify-between">
                      <span>Catégorie</span>
                      <span className="font-semibold text-zinc-800">{c.category ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Tarif</span>
                      <span className="font-semibold text-zinc-800">{formatAmount(c.prix)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Remise</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-semibold text-zinc-800">{formatAmount(c.remise)}</span>
                        {(c.remise ?? 0) > 0 && (
                          <button
                            onClick={() => setClearRemiseTarget(c.id)}
                            title="Supprimer la remise"
                            className="rounded p-0.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-1.5">
                      {contactEmail ? (
                        <button
                          onClick={() => openRelancePreview([c.id])}
                          className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          Envoyer une relance
                        </button>
                      ) : (
                        <span
                          title="Aucun contact connu"
                          className="flex cursor-not-allowed items-center gap-1 text-[11px] font-semibold text-zinc-300"
                        >
                          <Mail className="h-3 w-3" />
                          Envoyer une relance
                        </span>
                      )}
                      <button
                        onClick={() => openReceiptWindow(c, contactEmail)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:underline"
                      >
                        <Receipt className="h-3 w-3" />
                        Générer reçu / facture
                      </button>
                    </div>
                  </div>
                );
              })()}
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
                        <li key={p.id} className="flex items-center justify-between gap-2 text-xs text-zinc-600">
                          <span>
                            {new Date(p.paidAt).toLocaleDateString("fr-FR")} — {p.mode}
                            {p.detail ? ` (${p.detail})` : ""}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <span className="font-semibold text-zinc-800">{formatAmount(p.amount)}</span>
                            <button
                              onClick={() => openEditPayment(c.id, p)}
                              title="Modifier ce règlement"
                              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setDeletePaymentTarget({ paymentId: p.id, cotisationId: c.id })}
                              title="Supprimer ce règlement"
                              className="rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </span>
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
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={confirmPayment}
                disabled={paymentSaving || (paymentIds.length === 1 && Number(paymentAmount) <= 0)}
                className="rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
              >
                {paymentSaving
                  ? "Enregistrement..."
                  : paymentIds.length === 1
                    ? "Ajouter ce règlement"
                    : "Confirmer"}
              </button>
              {paymentIds.length === 1 && (
                <button
                  onClick={() => setPaymentIds(null)}
                  className="rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
                >
                  Terminé
                </button>
              )}
            </div>
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

      {editPayment && (
        <Modal title="Modifier un règlement" onClose={() => setEditPayment(null)}>
          <div className="flex flex-col gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Montant (€)
              </label>
              <input
                type="number"
                value={editPayment.amount}
                onChange={(e) =>
                  setEditPayment((p) => (p ? { ...p, amount: e.target.value } : p))
                }
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Mode de paiement
              </label>
              <select
                value={editPayment.mode}
                onChange={(e) =>
                  setEditPayment((p) => (p ? { ...p, mode: e.target.value } : p))
                }
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              >
                {paymentModes.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Détail (n° chèque, banque...)
              </label>
              <input
                type="text"
                value={editPayment.detail}
                onChange={(e) =>
                  setEditPayment((p) => (p ? { ...p, detail: e.target.value } : p))
                }
                placeholder="Optionnel"
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Date du règlement
              </label>
              <input
                type="date"
                value={editPayment.paidAt}
                onChange={(e) =>
                  setEditPayment((p) => (p ? { ...p, paidAt: e.target.value } : p))
                }
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Date d&apos;encaissement prévue
              </label>
              <input
                type="date"
                value={editPayment.expectedCashDate}
                onChange={(e) =>
                  setEditPayment((p) => (p ? { ...p, expectedCashDate: e.target.value } : p))
                }
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <button
              onClick={confirmEditPayment}
              disabled={editPaymentSaving}
              className="mt-1 rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {editPaymentSaving ? "Enregistrement..." : "Confirmer"}
            </button>
          </div>
        </Modal>
      )}

      {relancePreview && (
        <Modal
          title={
            relancePreview.ids.length === 1
              ? "Prévisualisation du message"
              : `Prévisualisation du message (${relancePreview.ids.length} destinataires)`
          }
          onClose={() => setRelancePreview(null)}
          wide
        >
          <div className="flex flex-col gap-3">
            {relancePreview.ids.length > 1 && (
              <p className="rounded-lg bg-zinc-50 p-2 text-xs text-zinc-500">
                Les balises {"{prenom}"}, {"{nom}"}, {"{tarif}"}, {"{paye}"} et {"{solde}"}{" "}
                seront remplacées individuellement pour chaque destinataire au moment de
                l&apos;envoi.
              </p>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Sujet du mail
              </label>
              <input
                type="text"
                value={relancePreview.subject}
                onChange={(e) =>
                  setRelancePreview((p) => (p ? { ...p, subject: e.target.value } : p))
                }
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Corps du message
              </label>
              <textarea
                value={relancePreview.body}
                onChange={(e) =>
                  setRelancePreview((p) => (p ? { ...p, body: e.target.value } : p))
                }
                rows={9}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={relancePreview.attachReceipt}
                onChange={(e) =>
                  setRelancePreview((p) =>
                    p
                      ? {
                          ...p,
                          attachReceipt: e.target.checked,
                          body: withReceiptMention(p.body, e.target.checked),
                        }
                      : p
                  )
                }
                className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
              />
              <span className="flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-zinc-500" />
                Joindre la facture / l&apos;attestation de paiement au mail
              </span>
            </label>
            {manualNotice && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {manualNotice}
              </p>
            )}

            <div className="mt-1 flex items-center gap-2">
              {/* No mail service configured yet: a real <a> (not a
                  window.open after an await) so the draft opens on the
                  user's own click and never trips the popup blocker. */}
              {mailServiceConfigured === false && relancePreview.ids.length === 1
                ? (() => {
                    const c = byId.get(relancePreview.ids[0]);
                    const email = c ? contactEmailByPlayerId[c.playerId] ?? null : null;
                    if (!c || !email) return null;
                    return (
                      <a
                        href={buildGmailComposeLink({
                          to: email,
                          subject: relancePreview.subject,
                          body: withSignature(relancePreview.body),
                        })}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          if (relancePreview.attachReceipt) {
                            downloadReceiptPdf(c, email);
                            setManualNotice(
                              "Le PDF de la facture a été téléchargé dans vos Téléchargements. Glissez-le simplement dans le mail Gmail qui vient de s'ouvrir."
                            );
                          }
                        }}
                        className="rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
                      >
                        Ouvrir dans Gmail
                      </a>
                    );
                  })()
                : (
                    <button
                      onClick={confirmSendRelance}
                      disabled={relanceSending}
                      className="rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
                    >
                      {relanceSending ? "Envoi..." : "Envoyer le mail"}
                    </button>
                  )}
              <button
                onClick={() => setRelancePreview(null)}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
              >
                {mailServiceConfigured === false ? "Fermer" : "Annuler"}
              </button>
            </div>

            {mailServiceConfigured === false && (
              <p className="flex items-start gap-2 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ubac-yellow-dark" />
                Astuce : pour envoyer les factures en 1 clic, sans manipulation de fichier,
                configurez la clé RESEND_API_KEY dans Vercel.
              </p>
            )}
          </div>
        </Modal>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-[60] flex max-w-[90vw] -translate-x-1/2 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${
            toast.variant === "error" ? "bg-red-600" : "bg-navy"
          }`}
        >
          {toast.variant === "error" ? (
            <TriangleAlert className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          )}
          {toast.message}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(clearRemiseTarget)}
        title="Supprimer la remise ?"
        message="Êtes-vous sûr de vouloir supprimer la remise appliquée à ce membre ?"
        confirmLabel="Supprimer"
        onConfirm={() => clearRemiseTarget && clearRemise(clearRemiseTarget)}
        onCancel={() => setClearRemiseTarget(null)}
      />
      <ConfirmDialog
        open={Boolean(deletePaymentTarget)}
        title="Supprimer ce règlement ?"
        message="Le total payé et le solde seront recalculés automatiquement."
        confirmLabel="Supprimer"
        onConfirm={() =>
          deletePaymentTarget &&
          deletePayment(deletePaymentTarget.paymentId, deletePaymentTarget.cotisationId)
        }
        onCancel={() => setDeletePaymentTarget(null)}
      />
    </div>
  );
}
