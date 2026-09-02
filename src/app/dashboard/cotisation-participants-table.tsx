"use client";

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
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
  Printer,
  Receipt,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLogoBase64, PDF_COLORS } from "@/lib/pdf-brand";
import EmptyState from "./empty-state";
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
// statusBadge exportée à son tour (nettoyage du 31/08) : family-cotisation-
// card.tsx avait sa propre palette de couleurs pour ces 4 mêmes statuts,
// différente de la palette de marque validée ci-dessous — mêmes libellés,
// couleurs différentes selon l'espace où on regarde le même statut.
export { statusBadge };

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
  portalId,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  // Audit du 2026-09-01 (retour de Cindy, "page vide" après le premier
  // correctif de l'impression) : cette Modal reste imbriquée dans l'arbre
  // normal de la page (jamais un portail vers <body>), donc "cacher tout le
  // reste avec display:none" cachait aussi SES PROPRES ancêtres (le reste
  // du tableau Cotisations, le layout du dashboard...) — un display:none
  // sur un ancêtre retire tout son sous-arbre du rendu, quoi qu'on essaie
  // de forcer plus bas dans la Modal elle-même. visibility:hidden (la
  // version d'avant) n'avait pas ce souci d'ancêtre, mais laissait leur
  // hauteur en place, d'où les pages blanches en surnombre.
  // portalId règle les deux à la fois : cette Modal devient un vrai enfant
  // direct de <body> (voir createPortal plus bas), donc "cacher tout le
  // reste" ne cache plus aucun de ses ancêtres — seulement décidé au cas
  // par cas (uniquement pour le reçu, qui a besoin d'imprimer proprement ;
  // les autres Modal de ce fichier n'ont pas cet identifiant et gardent
  // leur comportement d'avant, inchangé).
  portalId?: string;
}) {
  // Retour de Cindy du 2026-09-01 ("le bloc à moitié avec de l'ombre au
  // milieu") : #receipt-print-area (dans children) s'échappe bien de cette
  // carte via position:absolute à l'impression, mais la carte elle-même
  // (fond blanc, coins arrondis, ombre, padding) reste un vrai bloc dans la
  // page — on ne peut pas la display:none (elle contiendrait alors aussi
  // #receipt-print-area, display:none sur un ancêtre retire tout son
  // sous-arbre, voir le commentaire sur portalId plus haut). On retire donc
  // seulement son HABILLAGE visuel à l'impression, jamais pour les autres
  // Modal de ce fichier.
  const printNeutralBackdrop = portalId ? "print:bg-transparent print:p-0" : "";
  const printNeutralCard = portalId
    ? "print:m-0 print:max-w-none print:rounded-none print:p-0 print:shadow-none print:bg-transparent"
    : "";
  const node = (
    <div
      id={portalId}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 ${printNeutralBackdrop}`}
    >
      <div
        className={`w-full ${wide ? "max-w-lg" : "max-w-sm"} rounded-2xl bg-white p-5 shadow-xl ${printNeutralCard}`}
      >
        {/* print:hidden uniquement quand portalId est posé (le reçu) : le
            titre/la croix n'ont rien à faire sur la page imprimée, mais les
            autres Modal de ce fichier (jamais imprimées) restent
            inchangées. */}
        <div className={`mb-3 flex items-center justify-between ${portalId ? "print:hidden" : ""}`}>
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
  if (portalId && typeof document !== "undefined") {
    return createPortal(node, document.body);
  }
  return node;
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

// Mêmes 4 états que statusBadge (cotisation-shared / ce fichier), en RGB
// {fond, texte} pour le bandeau de solde du PDF. Le logo et les couleurs de
// marque génériques vivent maintenant dans src/lib/pdf-brand.ts (audit du
// 2026-09-01, en ajoutant les comptes rendus) — réutilisés tels quels ici.
const PDF_STATUS_COLORS: Record<StatusKey, { bg: readonly [number, number, number]; text: readonly [number, number, number] }> = {
  PAYE: { bg: [233, 245, 238], text: [62, 143, 95] },
  PARTIEL: { bg: [248, 236, 221], text: [185, 116, 48] },
  OFFERT: { bg: [230, 232, 245], text: [32, 48, 144] },
  EN_ATTENTE: { bg: [253, 232, 224], text: [209, 74, 34] },
};

// Same content as the on-screen/printed receipt (#receipt-print-area plus
// haut), laid out as an actual PDF (via jsPDF, pure client-side, no server
// round-trip) so it can be attached to a relance/confirmation email. Title
// reflects the same "Reçu / Facture acquittée" vs "Appel de cotisation"
// distinction, driven by whether anything is still due.
async function buildReceiptPdfBase64(c: AdminCotisation, contactEmail: string | null) {
  const balance = balanceDue(c);
  const isSettled = balance <= 0;
  const kicker = isSettled ? "Reçu / Facture acquittée" : "Appel de cotisation";
  const statusKey = computeStatus(c);
  const status = statusBadge[statusKey];
  const statusColors = PDF_STATUS_COLORS[statusKey];
  // jsPDF (1,2 Mo) importé ici, seulement au moment où un reçu est
  // vraiment demandé — retour de Cindy du 02/09 ("le site est très long
  // à s'afficher") : en haut du fichier, cette librairie partait dans le
  // même paquet JS que tout le tableau de bord, chargé et exécuté par
  // n'importe quel compte dès la connexion, alors qu'elle ne sert qu'au
  // clic sur "Télécharger en PDF"/"Imprimer".
  const [{ jsPDF }, logo] = await Promise.all([import("jspdf"), getLogoBase64()]);

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  // --- Bandeau d'en-tête marine, même dégradé/logo/kicker que l'écran ---
  doc.setFillColor(...PDF_COLORS.navy);
  doc.rect(0, 0, pageWidth, 42, "F");
  let logoWidth = 0;
  if (logo) {
    try {
      doc.setFillColor(...PDF_COLORS.white);
      doc.roundedRect(marginX, 8, 14, 14, 2, 2, "F");
      doc.addImage(logo, "PNG", marginX + 1, 9, 12, 12);
      logoWidth = 18;
    } catch (e) {
      console.error("[cotisation-participants-table] insertion du logo échouée:", e);
    }
  }
  doc.setTextColor(...PDF_COLORS.white);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Union Basket Angoulins Châtelaillon", marginX + logoWidth, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.headerSubtext);
  doc.text("Angoulins · Châtelaillon-Plage · Saint-Vivien", marginX + logoWidth, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.gold);
  doc.text(kicker.toUpperCase(), marginX, 28);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...PDF_COLORS.headerSubtext);
  doc.text(new Date().toLocaleDateString("fr-FR"), pageWidth - marginX, 28, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text(c.playerName, marginX, 35);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.headerSubtext);
  doc.text(c.collecteName ?? `Cotisation ${c.saison}`, marginX, 40);

  // --- Carte d'identité (catégorie / adhésion / contact) ---
  let y = 54;
  const infoLines = [
    c.category ? `Catégorie : ${c.category}` : null,
    c.membershipType ? `Type d'adhésion : ${c.membershipType}` : null,
    contactEmail ? `Contact : ${contactEmail}` : null,
  ].filter((l): l is string => Boolean(l));
  if (infoLines.length > 0) {
    const boxHeight = infoLines.length * 6 + 6;
    doc.setDrawColor(...PDF_COLORS.line);
    doc.roundedRect(marginX, y, contentWidth, boxHeight, 2, 2, "S");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...PDF_COLORS.ink);
    let lineY = y + 8;
    infoLines.forEach((line) => {
      doc.text(line, marginX + 5, lineY);
      lineY += 6;
    });
    y += boxHeight + 8;
  }

  // --- Tarif / remise / total versé ---
  doc.setFontSize(10);
  const amountRow = (label: string, value: string) => {
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(label, marginX, y);
    doc.setTextColor(...PDF_COLORS.ink);
    doc.setFont("helvetica", "bold");
    doc.text(value, pageWidth - marginX, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 7;
    doc.setDrawColor(...PDF_COLORS.line);
    doc.line(marginX, y - 3, pageWidth - marginX, y - 3);
  };
  amountRow("Tarif", formatAmount(c.prix));
  amountRow("Remise", formatAmount(c.remise));
  amountRow("Total versé", formatAmount(c.paiement));
  y += 3;

  // --- Bandeau de solde, couleur du statut (même palette que l'écran) ---
  doc.setFillColor(...statusColors.bg);
  doc.roundedRect(marginX, y, contentWidth, 14, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...statusColors.text);
  doc.text(`SOLDE RESTANT DÛ · ${status.label.toUpperCase()}`, marginX + 5, y + 9);
  doc.setFontSize(12);
  doc.text(formatAmount(balance), pageWidth - marginX - 5, y + 9.5, { align: "right" });
  y += 22;

  // --- Détail des règlements ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("DÉTAIL DES RÈGLEMENTS", marginX, y);
  y += 6;
  if (c.payments.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    [...c.payments]
      .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime())
      .forEach((p, i) => {
        if (i % 2 === 1) {
          doc.setFillColor(...PDF_COLORS.rowAlt);
          doc.rect(marginX, y - 4.5, contentWidth, 6.5, "F");
        }
        doc.setTextColor(...PDF_COLORS.ink);
        const label = `${new Date(p.paidAt).toLocaleDateString("fr-FR")} — ${p.mode}${p.detail ? ` (${p.detail})` : ""}`;
        doc.text(label, marginX, y);
        doc.setFont("helvetica", "bold");
        doc.text(formatAmount(p.amount), pageWidth - marginX, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += 6.5;
      });
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text("Aucun règlement enregistré pour le moment.", marginX, y);
    doc.setFont("helvetica", "normal");
    y += 6.5;
  }

  // --- Pied de page ---
  const pageHeight = doc.internal.pageSize.getHeight();
  const footerY = pageHeight - 16;
  doc.setDrawColor(...PDF_COLORS.line);
  doc.line(marginX, footerY - 6, pageWidth - marginX, footerY - 6);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PDF_COLORS.navy);
  doc.text(
    isSettled ? "Merci pour votre confiance !" : "Merci de régulariser cette cotisation",
    marginX,
    footerY
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text("ubac17.basket@gmail.com · ubac17.fr", pageWidth - marginX, footerY, { align: "right" });

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
async function downloadReceiptPdf(c: AdminCotisation, contactEmail: string | null) {
  const { base64, filename } = await buildReceiptPdfBase64(c, contactEmail);
  const link = document.createElement("a");
  link.href = `data:application/pdf;base64,${base64}`;
  link.download = filename;
  link.click();
}

// Audit du 2026-09-01 (retour de Cindy, un membre du Bureau sur iPhone) :
// "Télécharger en PDF" ci-dessus repose sur data:URI + <a download>, une
// combinaison que Safari/iOS ne respecte pas de façon fiable (ignore le
// téléchargement, ouvre juste un onglet, ou ne fait rien du tout en mode
// standalone) — même famille de bug que window.open le 31/08, mais aucun
// contournement web fiable n'existe côté téléchargement direct pour iOS.
// Le bouton "Imprimer" juste à côté, lui, ouvre la vraie feuille
// d'impression native d'Apple — et depuis cette feuille, iOS propose déjà
// "Enregistrer dans Fichiers"/export PDF, un mécanisme 100% fiable. Sur
// iPhone/iPad, on met donc ce chemin en avant plutôt que de réparer un
// téléchargement qui ne peut pas l'être.
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Audit du 31/08 (retour de Cindy, iPhone) : ceci ouvrait auparavant une
// vraie nouvelle fenêtre de navigateur (window.open + document.write) pour
// y afficher le reçu avant de lancer l'impression. Sur ordinateur ça
// fonctionne (un vrai onglet, avec sa croix normale) — mais depuis l'appli
// installée sur l'écran d'accueil d'un iPhone (mode "standalone"), ouvrir
// une fenêtre de cette façon n'a soit aucune croix visible, soit fait
// sortir complètement de l'appli installée vers Safari, obligeant à se
// reconnecter. Remplacé par une vraie fenêtre à l'intérieur de l'appli
// (même composant Modal que partout ailleurs dans ce fichier), qui a donc
// toujours une croix qui fonctionne, sur tous les téléphones — voir le
// rendu de receiptTarget plus bas. L'impression cible uniquement cette
// zone via #receipt-print-area (voir le <style> dans ce même rendu),
// jamais besoin de quitter la page.

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

  const [receiptTarget, setReceiptTarget] = useState<{
    cotisation: AdminCotisation;
    contactEmail: string | null;
  } | null>(null);

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
      // .select("id") + vérification du nombre de lignes (audit du 31/08) :
      // RLS peut bloquer silencieusement cette écriture (0 ligne, pas
      // d'erreur) — le règlement serait déjà inséré dans l'historique mais
      // le solde affiché resterait figé à l'ancien montant sans que rien ne
      // le signale.
      const { error, data } = await supabase
        .from("cotisations")
        .update({ paiement: newPaid, mode_paiement: paymentMode, statut: newStatut })
        .eq("id", id)
        .select("id");
      if (error) {
        setPaymentSaving(false);
        setActionError(`Paiement impossible : ${error.message}`);
        return;
      }
      if ((data?.length ?? 0) === 0) {
        setPaymentSaving(false);
        setActionError(
          "Le règlement est enregistré, mais le solde n'a pas pu être mis à jour (droits d'accès). Recharge la page et réessaie."
        );
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
          // skipped: exclu du contrôle "0 ligne modifiée" plus bas — ce
          // n'est pas un blocage RLS, juste un id qui n'a jamais correspondu
          // à un dossier connu.
          if (!c) return { error: null, skipped: true };
          const remaining = balanceDue(c);
          if (remaining > 0) {
            const { error: paymentError } = await supabase.from("cotisation_payments").insert({
              cotisation_id: id,
              amount: remaining,
              mode: paymentMode,
            });
            if (paymentError) return { error: paymentError, data: [] as { id: string }[] };
          }
          return supabase
            .from("cotisations")
            .update({ paiement: due(c), mode_paiement: paymentMode, statut: "PAYE" })
            .eq("id", id)
            .select("id");
        })
      );
      const err = results.find((r) => r.error)?.error;
      if (err) {
        setPaymentSaving(false);
        setActionError(`Paiement impossible : ${err.message}`);
        return;
      }
      // Même vérification que ci-dessus, par dossier (audit du 31/08).
      if (results.some((r) => !("skipped" in r) && (r.data?.length ?? 0) === 0)) {
        setPaymentSaving(false);
        setActionError(
          "Le solde n'a pas pu être mis à jour pour au moins un membre (droits d'accès). Recharge la page et réessaie."
        );
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
    // Audit du 31/08 : une remise négative AUGMENTE le montant dû (due =
    // prix - remise) au lieu de le diminuer — aucun garde-fou ne
    // l'empêchait, une frappe malheureuse ("-50" au lieu de "50") changeait
    // silencieusement ce qui est dû à la hausse.
    if (amount < 0) {
      setActionError("La remise ne peut pas être négative.");
      return;
    }
    setRemiseSaving(true);
    setActionError(null);
    const supabase = createClient();
    const c = byId.get(remiseId);
    const paid = c?.paiement ?? 0;
    const newDue = Math.max(0, roundCents((c?.prix ?? 0) - amount));
    const newStatut = paid >= newDue ? "PAYE" : "EN_ATTENTE";
    const { error, data } = await supabase
      .from("cotisations")
      .update({ remise: amount, statut: newStatut })
      .eq("id", remiseId)
      .select("id");
    setRemiseSaving(false);
    if (error) {
      setActionError(`Remise impossible : ${error.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setActionError(
        "La remise n'a pas pu être enregistrée (droits d'accès). Recharge la page et réessaie."
      );
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
    const { error, data } = await supabase
      .from("cotisations")
      .update({ remise: 0, statut: newStatut })
      .eq("id", id)
      .select("id");
    if (error) {
      setActionError(`Suppression de la remise impossible : ${error.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setActionError(
        "La remise n'a pas pu être supprimée (droits d'accès). Recharge la page et réessaie."
      );
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
    const { error: updateError, data: updateData } = await supabase
      .from("cotisations")
      .update(update)
      .eq("id", cotisationId)
      .select("id");
    if (updateError) {
      setActionError(`Recalcul du solde impossible : ${updateError.message}`);
      return;
    }
    // Cette fonction est la "source de vérité" appelée après chaque édition/
    // suppression de règlement — si CETTE écriture-là est bloquée
    // silencieusement par RLS (audit du 31/08), plus rien ne réconcilie le
    // solde affiché avec l'historique réel des règlements.
    if ((updateData?.length ?? 0) === 0) {
      setActionError(
        "Le solde n'a pas pu être recalculé (droits d'accès). Recharge la page et réessaie."
      );
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
    const { error, data } = await supabase
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
      .eq("id", editPayment.id)
      .select("id");
    if (error) {
      setEditPaymentSaving(false);
      setActionError(`Modification impossible : ${error.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setEditPaymentSaving(false);
      setActionError(
        "Le règlement n'a pas pu être modifié (droits d'accès). Recharge la page et réessaie."
      );
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
    const { error, data } = await supabase
      .from("cotisation_payments")
      .delete()
      .eq("id", paymentId)
      .select("id");
    if (error) {
      setActionError(`Suppression impossible : ${error.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setActionError(
        "Le règlement n'a pas pu être supprimé (droits d'accès). Recharge la page et réessaie."
      );
      return;
    }
    await recomputeCotisationTotals(cotisationId);
    showToast("Règlement supprimé.");
    router.refresh();
  }

  async function exportSelection(ids: string[]) {
    // xlsx importé ici seulement (même correctif que jsPDF plus haut) : ne
    // sert qu'à ce bouton "Exporter", pas de raison qu'il pèse sur le
    // chargement initial du tableau de bord pour tout le monde.
    const XLSX = await import("xlsx");
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
            ? await buildReceiptPdfBase64(c, contactEmailByPlayerId[c.playerId] ?? null)
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

  // Menu ⋮ (Suivi/enregistrer paiement, relance, remise, reçu) partagé
  // entre la ligne de tableau (≥640px) et la carte mobile (<640px, voir
  // plus bas) — même correctif que members-table.tsx/renderMemberMenu :
  // un seul endroit à faire évoluer plutôt que deux copies qui divergent.
  // Le conteneur appelant doit être positionné (`relative`) pour que le
  // menu déroulant s'ancre au bon endroit.
  function renderRowMenu(c: AdminCotisation, contactEmail: string | null) {
    return (
      <>
        <button
          onClick={() => setOpenMenuId((cur) => (cur === c.id ? null : c.id))}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
        {openMenuId === c.id && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setOpenMenuId(null)} />
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
                  setReceiptTarget({ cotisation: c, contactEmail });
                }}
                className={menuItemClass}
              >
                <Receipt className="h-3.5 w-3.5" />
                Générer reçu / facture
              </button>
            </div>
          </>
        )}
      </>
    );
  }

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

      {/* Tableau classique à partir de 640px (sm) ; en dessous, cartes
          empilées (même traitement que members-table.tsx, retour de
          Cindy du 2026-08-24 : "réaliser sur mobile le même visuel que
          membres"), voir plus bas. */}
      <div className="hidden w-full overflow-x-auto rounded-2xl border border-l-4 border-zinc-100 border-l-ubac-yellow bg-white sm:block">
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
                    {renderRowMenu(c, contactEmail)}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="p-0">
                  <EmptyState icon={CreditCard} message={emptyLabel} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cartes empilées en dessous de 640px (sm) — même contenu que le
          tableau (nom/prénom, statut, tarif/remise/payé/solde, mode de
          paiement), même actions (tap = ouvre le suivi de paiement, ⋮ =
          menu partagé via renderRowMenu) — même traitement que
          members-table.tsx (retour de Cindy du 2026-08-24). */}
      <div className="flex flex-col gap-3 sm:hidden">
        {filtered.length > 0 && (
          <label className="flex items-center gap-2 self-start text-xs font-medium text-zinc-500">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleAll}
              className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
            />
            Tout sélectionner
          </label>
        )}
        {filtered.map((c) => {
          const status = statusBadge[computeStatus(c)];
          const contactEmail = contactEmailByPlayerId[c.playerId] ?? null;
          return (
            <div
              key={c.id}
              onClick={() => openPayment([c.id])}
              className="rounded-2xl border border-l-4 border-zinc-100 border-l-ubac-yellow bg-white p-3.5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggleOne(c.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-900">
                      {cotisationLastName(c)} {cotisationFirstName(c)}
                    </p>
                    <span
                      className={`mt-0.5 inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${status.className}`}
                    >
                      {status.label}
                    </span>
                  </div>
                </div>
                <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                  {renderRowMenu(c, contactEmail)}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-zinc-50 pt-2 text-xs text-zinc-600">
                <span>
                  Tarif <span className="font-semibold text-zinc-800">{formatAmount(c.prix)}</span>
                </span>
                <span>
                  Remise <span className="font-semibold text-zinc-800">{formatAmount(c.remise)}</span>
                </span>
                <span>
                  Payé <span className="font-semibold text-zinc-800">{formatAmount(c.paiement)}</span>
                </span>
                <span>
                  Solde{" "}
                  <span className="font-semibold text-zinc-900">{formatAmount(balanceDue(c))}</span>
                </span>
                <span className="col-span-2">Mode {c.mode_paiement ?? "—"}</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <EmptyState
            icon={CreditCard}
            message={emptyLabel}
            className="rounded-2xl border border-zinc-100 bg-white"
          />
        )}
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
                        onClick={() => setReceiptTarget({ cotisation: c, contactEmail })}
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

      {receiptTarget &&
        (() => {
          const c = receiptTarget.cotisation;
          const status = statusBadge[computeStatus(c)];
          // Même seuil que buildReceiptPdfBase64 (le PDF téléchargeable) :
          // les deux versions doivent afficher exactement le même intitulé
          // ("acquittée" vs "appel de cotisation") pour la même situation.
          const isSettled = balanceDue(c) <= 0;
          const sortedPayments = [...c.payments].sort(
            (a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime()
          );
          return (
            <Modal
              title="Reçu / facture"
              onClose={() => setReceiptTarget(null)}
              wide
              portalId="receipt-modal-root"
            >
              {/* Cible l'impression sur ce seul bloc (audit du 31/08) : plus
                  besoin d'ouvrir une fenêtre séparée pour imprimer juste le
                  reçu — voir le commentaire sur l'ancienne openReceiptWindow
                  plus haut dans ce fichier.
                  Audit du 2026-09-01 (retour de Cindy, "5 pages"/"23 pages"
                  selon le PC, puis "page vide" après un premier correctif
                  raté) : voir le commentaire sur portalId dans Modal
                  ci-dessus pour l'explication complète. Grâce au portail,
                  masquer tout ce qui n'est pas #receipt-modal-root (un vrai
                  enfant direct de body) ne cache plus aucun ancêtre du reçu
                  — le reçu s'affiche normalement, et l'impression ne mesure
                  plus que sa propre hauteur (une seule page). Le titre/la
                  croix (print:hidden dans Modal) et les boutons juste en
                  dessous (print:hidden plus bas) restent masqués à
                  l'impression comme avant ; #receipt-print-area repasse en
                  position absolute, pleine largeur, pour ignorer le
                  max-w-lg de la carte Modal (pensé pour l'écran, pas pour
                  une page à imprimer) — sans dépendre cette fois d'un
                  display:none/revert fragile sur ses ancêtres. */}
              {/* Audit du 2026-09-01 (retour de Cindy, "moins beau à
                  l'impression" alors que le PDF est nickel) : Chrome/Edge
                  n'impriment JAMAIS les couleurs de fond par défaut (case
                  "Graphiques d'arrière-plan" décochée par défaut dans
                  "Plus de paramètres") — le bandeau marine, le bandeau de
                  solde coloré etc. disparaissaient donc silencieusement à
                  l'impression, sans que rien dans le code n'ait changé.
                  print-color-adjust: exact force leur impression sans que
                  l'utilisateur ait à cocher quoi que ce soit. @page portrait
                  évite aussi qu'un réglage "Paysage" resté en mémoire du
                  navigateur/de l'imprimante déforme la mise en page conçue
                  pour une feuille verticale. */}
              <style>{`
                @media print {
                  @page { size: portrait; }
                  body > *:not(#receipt-modal-root) { display: none !important; }
                  #receipt-print-area { position: absolute; left: 0; top: 0; width: 100%; }
                  #receipt-print-area, #receipt-print-area * {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                }
              `}</style>
              {/* Refonte visuelle (retour de Cindy du 2026-09-01, "plus
                  sexy", maquette validée) : même identité que le reste de
                  l'appli — bandeau marine/or, Poppins pour les titres
                  (font-display), Space Grotesk pour les montants
                  (font-numeric), et les 4 couleurs de statut déjà utilisées
                  dans le tableau Cotisations (statusBadge) réutilisées telle
                  quelles pour la ligne de solde, plutôt qu'une nouvelle
                  palette inventée pour ce seul écran. */}
              <div
                id="receipt-print-area"
                className="overflow-hidden rounded-2xl border border-zinc-100 text-zinc-800"
              >
                <div className="relative overflow-hidden bg-gradient-to-br from-navy to-navy-dark px-6 py-5 text-white">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-ubac-yellow/15 blur-2xl"
                  />
                  <div className="relative flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element --
                        <Image> de next/image ne s'affiche pas de façon
                        fiable à l'impression (chargement différé/
                        optimisation) ; un <img> classique, direct sur le
                        fichier public, reste simple et fiable ici (retour
                        de Cindy du 2026-09-01, "ajouter le logo ubac dans
                        la facture"). */}
                    <img
                      src="/logo.png"
                      alt="UBAC"
                      className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-1 shadow"
                    />
                    <div className="min-w-0">
                      <p className="font-display truncate text-sm font-bold">
                        Union Basket Angoulins Châtelaillon
                      </p>
                      <p className="text-[11px] text-white/60">
                        Angoulins · Châtelaillon-Plage · Saint-Vivien
                      </p>
                    </div>
                  </div>
                  <div className="relative mt-4 flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-ubac-yellow">
                      {isSettled ? "Reçu / Facture acquittée" : "Appel de cotisation"}
                    </span>
                    <span className="text-[11px] text-white/50">
                      {new Date().toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <p className="font-display relative mt-1 text-xl font-bold">{c.playerName}</p>
                  <p className="relative text-sm text-white/70">
                    {c.collecteName ?? `Cotisation ${c.saison}`}
                  </p>
                </div>

                <div className="flex flex-col gap-4 bg-white px-6 py-5">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-xl border border-zinc-100 p-4">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        Catégorie
                      </p>
                      <p className="text-sm font-semibold text-zinc-900">{c.category ?? "—"}</p>
                    </div>
                    {c.membershipType && (
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                          Type d&apos;adhésion
                        </p>
                        <p className="text-sm font-semibold text-zinc-900">{c.membershipType}</p>
                      </div>
                    )}
                    {receiptTarget.contactEmail && (
                      <div className="col-span-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                          Contact
                        </p>
                        <p className="text-sm font-semibold text-zinc-900">
                          {receiptTarget.contactEmail}
                        </p>
                      </div>
                    )}
                  </div>

                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      <tr className="border-b border-dashed border-zinc-200">
                        <td className="py-1.5 text-zinc-500">Tarif</td>
                        <td className="font-numeric py-1.5 text-right font-semibold">
                          {formatAmount(c.prix)}
                        </td>
                      </tr>
                      <tr className="border-b border-dashed border-zinc-200">
                        <td className="py-1.5 text-zinc-500">Remise</td>
                        <td className="font-numeric py-1.5 text-right font-semibold">
                          {formatAmount(c.remise)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-1.5 text-zinc-500">Total versé</td>
                        <td className="font-numeric py-1.5 text-right font-semibold">
                          {formatAmount(c.paiement)}
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  <div className={`flex items-center justify-between rounded-xl px-4 py-3 ${status.className}`}>
                    <span className="text-[11px] font-bold uppercase tracking-wide">
                      Solde restant dû · {status.label}
                    </span>
                    <span className="font-numeric text-lg font-bold">
                      {formatAmount(balanceDue(c))}
                    </span>
                  </div>

                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                      Détail des règlements
                    </p>
                    {sortedPayments.length > 0 ? (
                      <table className="w-full border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 text-left text-[10px] uppercase text-zinc-400">
                            <th className="pb-1.5 font-semibold">Date</th>
                            <th className="pb-1.5 font-semibold">Mode</th>
                            <th className="pb-1.5 font-semibold">Détail</th>
                            <th className="pb-1.5 text-right font-semibold">Montant</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedPayments.map((p, i) => (
                            <tr
                              key={p.id}
                              className={i % 2 === 1 ? "bg-zinc-50" : undefined}
                            >
                              <td className="py-1.5 pl-0">
                                {new Date(p.paidAt).toLocaleDateString("fr-FR")}
                              </td>
                              <td className="py-1.5">{p.mode}</td>
                              <td className="py-1.5 text-zinc-500">{p.detail ?? "—"}</td>
                              <td className="font-numeric py-1.5 text-right font-semibold">
                                {formatAmount(p.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm italic text-zinc-400">
                        Aucun règlement enregistré pour le moment.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-6 py-4">
                  <p className="font-display text-xs font-semibold text-navy">
                    {isSettled ? "Merci pour votre confiance !" : "Merci de régulariser cette cotisation"}
                  </p>
                  <p className="text-right text-[10px] leading-relaxed text-zinc-400">
                    ubac17.basket@gmail.com
                    <br />
                    ubac17.fr
                  </p>
                </div>
              </div>
              {/* print:hidden : ces boutons n'ont rien à faire sur la page
                  imprimée (voir le commentaire sur portalId dans Modal). */}
              <div className="mt-4 flex flex-col gap-2 print:hidden">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimer
                  </button>
                  {/* data:URI + <a download> ne fonctionne pas de façon
                      fiable sur iPhone/iPad (voir isIOS ci-dessus) : le
                      bouton n'y est proposé que là où il marche vraiment. */}
                  {!isIOS() && (
                    <button
                      onClick={() => downloadReceiptPdf(c, receiptTarget.contactEmail)}
                      className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Télécharger en PDF
                    </button>
                  )}
                </div>
                {isIOS() && (
                  <p className="text-xs text-zinc-500">
                    Pour l&apos;enregistrer en PDF sur iPhone/iPad : bouton Imprimer
                    ci-dessus, puis « Enregistrer dans Fichiers » (ou « Options
                    PDF ») depuis l&apos;aperçu d&apos;impression.
                  </p>
                )}
              </div>
            </Modal>
          );
        })()}

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
              min="0"
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
                            // Même limite que le bouton "Télécharger en PDF"
                            // ci-dessus (audit du 2026-09-01) : le
                            // téléchargement automatique ne fonctionne pas
                            // sur iPhone/iPad, glisser un fichier inexistant
                            // dans Gmail n'a aucun sens sur ces appareils.
                            if (isIOS()) {
                              setManualNotice(
                                "Sur iPhone/iPad, le PDF ne se télécharge pas automatiquement : ouvre « Générer reçu / facture » sur cette fiche, puis Imprimer → Enregistrer dans Fichiers, avant de joindre le fichier au mail Gmail qui vient de s'ouvrir."
                              );
                            } else {
                              downloadReceiptPdf(c, email);
                              setManualNotice(
                                "Le PDF de la facture a été téléchargé dans vos Téléchargements. Glissez-le simplement dans le mail Gmail qui vient de s'ouvrir."
                              );
                            }
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
