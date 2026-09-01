"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import { FileText, Plus, Printer, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLogoBase64, PDF_COLORS } from "@/lib/pdf-brand";
import type { ClubReport } from "./page";
import ConfirmDialog from "./confirm-dialog";

// Comptes rendus (retour de Cindy du 2026-09-01, "un texte que l'on peut
// écrire directement... téléchargeable si besoin pour être imprimé") —
// texte simple stocké en base (club_reports), jamais de fichier pour ces
// catégories : aucun coût de stockage, contrairement à un PDF déposé. Le
// PDF n'est généré qu'à la demande (comme les factures de Cotisations),
// jamais conservé.

// Même limite que la facture (Safari/iOS n'honore pas data:URI + <a
// download> de façon fiable) : bouton masqué sur iPhone/iPad, "Imprimer"
// mis en avant à la place.
function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

// Modal avec option de portail vers <body> — copie du même mécanisme que
// cotisation-participants-table.tsx (audit du 2026-09-01) : nécessaire pour
// qu'un "cacher tout sauf ce bloc" à l'impression ne cache pas non plus ses
// propres ancêtres. Dupliqué plutôt que partagé : chaque écran de l'appli a
// déjà sa propre Modal locale (members-table.tsx en a une aussi), c'est la
// convention existante ici plutôt qu'un composant Modal unique partagé.
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
  portalId?: string;
}) {
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
        className={`w-full ${wide ? "max-w-lg" : "max-w-sm"} max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ${printNeutralCard}`}
      >
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

// Même bandeau marine + logo que le reçu de Cotisations (retour de Cindy du
// 2026-09-01, "en ajoutant le logo ubac en début de corps de texte un peu
// comme les factures") — identité visuelle commune plutôt qu'un style par
// écran.
function ReportLetterhead({
  title,
  reportDate,
  authorName,
}: {
  title: string;
  reportDate: string;
  authorName?: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-navy to-navy-dark px-5 py-4 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-ubac-yellow/15 blur-2xl"
      />
      <div className="relative flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- même
            raison que sur le reçu de Cotisations : <Image> de next/image
            ne s'affiche pas de façon fiable à l'impression. */}
        <img
          src="/logo.png"
          alt="UBAC"
          className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain p-1 shadow"
        />
        <div className="min-w-0">
          <p className="font-display truncate text-sm font-bold">
            Union Basket Angoulins Châtelaillon
          </p>
          <p className="text-[11px] text-white/60">
            {new Date(reportDate).toLocaleDateString("fr-FR", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
      <p className="font-display relative mt-2 text-lg font-bold">{title}</p>
      {authorName && <p className="relative text-xs text-white/60">Par {authorName}</p>}
    </div>
  );
}

async function buildReportPdfBase64(report: {
  title: string;
  reportDate: string;
  body: string | null;
  authorName?: string | null;
}) {
  const logo = await getLogoBase64();
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  doc.setFillColor(...PDF_COLORS.navy);
  doc.rect(0, 0, pageWidth, 36, "F");
  let logoWidth = 0;
  if (logo) {
    try {
      doc.setFillColor(...PDF_COLORS.white);
      doc.roundedRect(marginX, 7, 14, 14, 2, 2, "F");
      doc.addImage(logo, "PNG", marginX + 1, 8, 12, 12);
      logoWidth = 18;
    } catch (e) {
      console.error("[club-reports-section] insertion du logo échouée:", e);
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text("Union Basket Angoulins Châtelaillon", marginX + logoWidth, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...PDF_COLORS.headerSubtext);
  doc.text(
    new Date(report.reportDate).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    marginX + logoWidth,
    18
  );
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...PDF_COLORS.white);
  doc.text(report.title, marginX, 29);
  if (report.authorName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...PDF_COLORS.headerSubtext);
    doc.text(`Par ${report.authorName}`, marginX, 34);
  }

  let y = 50;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PDF_COLORS.ink);
  const lines = doc.splitTextToSize(report.body ?? "", pageWidth - marginX * 2) as string[];
  lines.forEach((line) => {
    if (y > pageHeight - 16) {
      doc.addPage();
      y = 20;
    }
    doc.text(line, marginX, y);
    y += 6;
  });

  const dataUri = doc.output("datauristring");
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const safeName = report.title.trim().replace(/[^a-zA-Z0-9-]+/g, "_") || "compte-rendu";
  return { base64, filename: `${safeName}.pdf` };
}

function downloadReportPdf(base64: string, filename: string) {
  const link = document.createElement("a");
  link.href = `data:application/pdf;base64,${base64}`;
  link.download = filename;
  link.click();
}

export default function ClubReportsSection({
  category,
  title,
  emptyLabel,
  canCreate,
  isAdmin,
  currentUserId = null,
  showAuthor = false,
  reports,
}: {
  category: ClubReport["category"];
  title: string;
  emptyLabel: string;
  // Peut créer un nouveau compte rendu dans cette catégorie (bouton
  // "Nouveau"). Distinct des droits de modification ci-dessous : voir/
  // modifier un compte rendu COACH déjà créé par quelqu'un d'autre est
  // possible sans pouvoir en créer un nouveau soi-même depuis cet écran
  // (cas du Bureau, qui consulte/corrige les comptes rendus coachs mais
  // n'en rédige jamais en tant que "coach" depuis son propre onglet).
  canCreate: boolean;
  // isAdmin/currentUserId plutôt qu'une fonction canEditRow (audit du
  // 2026-09-01) : admin-view.tsx/coach-view.tsx sont des Server Components,
  // qui ne peuvent pas passer une fonction à un composant client ("use
  // client" ici) — seules des données sérialisables traversent cette
  // frontière. canEditRow(report) est donc recalculé plus bas, à partir de
  // ces deux valeurs simples.
  isAdmin: boolean;
  currentUserId?: string | null;
  // Plusieurs auteurs partagent la même liste (comptes rendus COACH) :
  // afficher qui a écrit quoi. Toujours false pour Mairies/Bureau (un seul
  // "auteur" logique, le Bureau, peu importe qui a cliqué "Enregistrer").
  showAuthor?: boolean;
  reports: ClubReport[];
}) {
  const router = useRouter();
  const list = reports.filter((r) => r.category === category);
  // Retour de Cindy du 2026-09-01 ("visible pour le bureau et les coach") :
  // un compte rendu COACH est visible par tous, mais modifiable/
  // supprimable seulement par son auteur (ou le Bureau) — un simple booléen
  // par catégorie ne suffit plus, il faut trancher ligne par ligne.
  const canEditRow = (r: ClubReport) => isAdmin || r.createdBy === currentUserId;

  const [detail, setDetail] = useState<ClubReport | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formBody, setFormBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClubReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openCreate() {
    setFormTitle("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormBody("");
    setError(null);
    setCreating(true);
  }

  function openEdit(r: ClubReport) {
    setFormTitle(r.title);
    setFormDate(r.reportDate);
    setFormBody(r.body ?? "");
    setError(null);
    setEditing(true);
  }

  async function confirmCreate() {
    if (!formTitle.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const { error: insertError } = await supabase.from("club_reports").insert({
      category,
      title: formTitle.trim(),
      report_date: formDate,
      body: formBody,
      created_by: userData.user?.id ?? null,
    });
    setSaving(false);
    if (insertError) {
      setError(`Enregistrement impossible : ${insertError.message}`);
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function confirmEdit() {
    if (!detail) return;
    if (!formTitle.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError, data } = await supabase
      .from("club_reports")
      .update({ title: formTitle.trim(), report_date: formDate, body: formBody })
      .eq("id", detail.id)
      .select("id");
    setSaving(false);
    if (updateError) {
      setError(`Enregistrement impossible : ${updateError.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setError("Modification bloquée par les droits d'accès (RLS).");
      return;
    }
    setEditing(false);
    setDetail(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const supabase = createClient();
    const { error: deleteError, data } = await supabase
      .from("club_reports")
      .delete()
      .eq("id", deleteTarget.id)
      .select("id");
    setDeleting(false);
    if (deleteError) {
      console.error("[club-reports-section] suppression échouée:", deleteError);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      console.error("[club-reports-section] suppression bloquée par les droits d'accès (RLS).");
      return;
    }
    setDeleteTarget(null);
    setDetail(null);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <FileText className="h-4 w-4 shrink-0 text-navy" />
          {title}
        </p>
        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-1 rounded-full bg-ubac-yellow px-2.5 py-1 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Nouveau
          </button>
        )}
      </div>
      <div className="flex flex-col">
        {list.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-400">{emptyLabel}</p>}
        {list.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setDetail(r)}
            className="flex items-center justify-between gap-2 border-b border-zinc-50 px-4 py-2.5 text-left last:border-b-0 hover:bg-zinc-50"
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">
              {r.title}
              {showAuthor && r.authorName && (
                <span className="ml-1.5 font-normal text-zinc-400">— {r.authorName}</span>
              )}
            </span>
            <span className="shrink-0 text-xs text-zinc-400">
              {new Date(r.reportDate).toLocaleDateString("fr-FR")}
            </span>
          </button>
        ))}
      </div>

      {/* Consultation / impression / export PDF — même mécanisme que le
          reçu de Cotisations (portail vers body, print-color-adjust pour
          que le bandeau marine s'imprime, bouton PDF masqué sur iPhone). */}
      {detail &&
        !editing &&
        (() => {
          const ios = isIOS();
          return (
            <Modal title={title} onClose={() => setDetail(null)} wide portalId="report-modal-root">
              <style>{`
                @media print {
                  @page { size: portrait; }
                  body > *:not(#report-modal-root) { display: none !important; }
                  #report-print-area { position: absolute; left: 0; top: 0; width: 100%; }
                  #report-print-area, #report-print-area * {
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                  }
                }
              `}</style>
              <div id="report-print-area" className="overflow-hidden rounded-2xl border border-zinc-100">
                <ReportLetterhead
                  title={detail.title}
                  reportDate={detail.reportDate}
                  authorName={showAuthor ? detail.authorName : null}
                />
                <div className="bg-white px-5 py-4">
                  <p className="whitespace-pre-wrap text-sm text-zinc-800">
                    {detail.body || "—"}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2 print:hidden">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    Imprimer
                  </button>
                  {!ios && (
                    <button
                      type="button"
                      onClick={async () => {
                        const { base64, filename } = await buildReportPdfBase64({
                          ...detail,
                          authorName: showAuthor ? detail.authorName : null,
                        });
                        downloadReportPdf(base64, filename);
                      }}
                      className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3.5 py-1.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Télécharger en PDF
                    </button>
                  )}
                  {canEditRow(detail) && (
                    <button
                      type="button"
                      onClick={() => openEdit(detail)}
                      className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-navy hover:bg-navy/5"
                    >
                      Modifier
                    </button>
                  )}
                  {canEditRow(detail) && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(detail)}
                      className="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Supprimer
                    </button>
                  )}
                </div>
                {ios && (
                  <p className="text-xs text-zinc-500">
                    Pour l&apos;enregistrer en PDF sur iPhone/iPad : bouton Imprimer ci-dessus, puis
                    « Enregistrer dans Fichiers » depuis l&apos;aperçu d&apos;impression.
                  </p>
                )}
              </div>
            </Modal>
          );
        })()}

      {/* Création */}
      {creating && (
        <Modal title={`Nouveau — ${title}`} onClose={() => setCreating(false)} wide>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Titre</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Réunion du 12 septembre"
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Texte</label>
              <textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={confirmCreate}
                disabled={saving}
                className="rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
              >
                Annuler
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modification */}
      {editing && detail && (
        <Modal title={`Modifier — ${title}`} onClose={() => setEditing(false)} wide>
          <div className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Titre</label>
              <input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Texte</label>
              <textarea
                value={formBody}
                onChange={(e) => setFormBody(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={confirmEdit}
                disabled={saving}
                className="rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
              >
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
              >
                Annuler
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer ce compte rendu ?"
        message={deleteTarget ? `« ${deleteTarget.title} » sera définitivement supprimé.` : ""}
        confirmLabel="Supprimer"
        pending={deleting}
        pendingLabel="Suppression..."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
