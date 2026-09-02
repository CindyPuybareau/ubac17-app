"use client";

import {
  useRef,
  useState,
  type ClipboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { jsPDF } from "jspdf";
import { Bold, Eraser, FileText, Highlighter, Italic, Plus, Printer, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getLogoBase64, PDF_COLORS } from "@/lib/pdf-brand";
import {
  editableNodeToReportText,
  parseReportRuns,
  reportTextToHtml,
  type ReportRun,
} from "@/lib/report-format";
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

// Affiche un texte de compte rendu en tenant compte des marqueurs
// **gras**/_italique_/==surligné== (retour de Cindy du 02/09) — jamais de
// HTML injecté, ces <strong>/<em>/<mark> viennent uniquement des segments
// que parseReportRuns calcule, jamais du texte tel quel. Mêmes retours à
// la ligne que l'ancien rendu texte brut (un <br/> par saut de ligne, pas
// de <p> imbriqués).
function FormattedReportText({ text }: { text: string }) {
  if (!text) return <span className="text-zinc-400">—</span>;
  const runs = parseReportRuns(text);
  return (
    <>
      {runs.map((run, i) => {
        const lines = run.text.split("\n");
        const content = lines.map((line, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {line}
          </span>
        ));
        let node: ReactNode = content;
        if (run.bold) node = <strong>{node}</strong>;
        if (run.italic) node = <em>{node}</em>;
        if (run.highlight) node = <mark className="rounded bg-ubac-yellow/60 px-0.5">{node}</mark>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

// Barre d'outils Gras/Italique/Surligner/Effacer + champ éditable —
// factorisée pour ne pas dupliquer les mêmes gestes entre les modales
// Création et Modification. Retour de Cindy du 02/09 ("voir le visuel
// directement dans le champ") : contentEditable plutôt qu'un <textarea> —
// on tape, on sélectionne, on clique sur un bouton, et le texte apparaît
// déjà en gras/italique/surligné à l'écran, jamais de marqueurs bruts
// visibles. La conversion vers/depuis la micro-syntaxe (**gras**...) se
// fait aux deux bouts (reportTextToHtml au montage, editableNodeToReportText
// à chaque frappe) : le stockage, le PDF et l'impression n'ont pas changé.
function ReportBodyEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Le contenu HTML n'est posé qu'une seule fois, au montage (voir le ref
  // callback ci-dessous) — jamais réaffecté à chaque frappe, sinon le
  // curseur sauterait au début du texte à chaque caractère tapé (React
  // reconstruirait le HTML depuis `value` et le navigateur perdrait la
  // position d'édition en cours, comme pour n'importe quel champ non
  // contrôlé dont on réécrirait le contenu pendant la saisie).
  const initializedRef = useRef(false);

  function initEditor(el: HTMLDivElement | null) {
    ref.current = el;
    if (!el || initializedRef.current) return;
    initializedRef.current = true;
    el.innerHTML = reportTextToHtml(value);
  }

  function syncFromDom() {
    const el = ref.current;
    if (!el) return;
    onChange(editableNodeToReportText(el));
  }

  // Sélectionne le contenu du nœud fraîchement créé pour permettre
  // d'enchaîner une autre mise en forme sans re-sélectionner à la main.
  function reselect(node: Node) {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function currentSelectionRange(): Range | null {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return null; // rien de sélectionné : aucun bouton n'a de texte à habiller
    if (!el.contains(range.commonAncestorContainer)) return null; // sélection hors du champ
    return range;
  }

  function wrapSelection(tagName: "strong" | "em" | "mark") {
    const range = currentSelectionRange();
    if (!range) return;
    const el = document.createElement(tagName);
    if (tagName === "mark") el.className = "rounded bg-ubac-yellow/60 px-0.5";
    el.appendChild(range.extractContents());
    range.insertNode(el);
    reselect(el);
    syncFromDom();
  }

  // Retire la mise en forme la plus englobante (gras/italique/surligné)
  // qui contient la sélection. Remplace la balise entière par son texte
  // brut plutôt que de ne toucher qu'au fragment sélectionné : un simple
  // extractContents+insertNode réinsère sinon le texte À L'INTÉRIEUR de la
  // même balise (son point de collage après extraction reste dedans), ce
  // qui ne change rien à l'écran — bogue trouvé en testant ce bouton en
  // conditions réelles.
  function clearFormatting() {
    const range = currentSelectionRange();
    const root = ref.current;
    if (!range || !root) return;

    let node: Node | null = range.commonAncestorContainer;
    let outerFormatted: HTMLElement | null = null;
    while (node && node !== root) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        ["STRONG", "B", "EM", "I", "MARK"].includes((node as HTMLElement).tagName)
      ) {
        outerFormatted = node as HTMLElement;
      }
      node = node.parentNode;
    }

    if (outerFormatted) {
      const text = document.createTextNode(outerFormatted.textContent ?? "");
      outerFormatted.replaceWith(text);
      reselect(text);
      syncFromDom();
      return;
    }

    // Sélection hors de toute balise de mise en forme : rien à faire,
    // mais on aplatit quand même par sécurité (fragment potentiellement
    // hétérogène après un collage, par exemple).
    const text = document.createTextNode(range.extractContents().textContent ?? "");
    range.insertNode(text);
    reselect(text);
    syncFromDom();
  }

  // Un texte collé (WhatsApp, Word, mail...) arrive souvent avec une mise
  // en forme cachée (police, couleurs, liens) qu'on ne veut jamais voir
  // atterrir dans un compte rendu — toujours collé en texte simple, la
  // seule façon d'avoir du gras/italique/surligné reste les boutons.
  function handlePaste(e: ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return;
    const text = e.clipboardData.getData("text/plain");
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    syncFromDom();
  }

  // onMouseDown (pas seulement onClick) avec preventDefault : un clic sur
  // un bouton de la barre déplacerait sinon le focus dessus AVANT que le
  // clic ne se déclenche, ce qui efface la sélection en cours dans le
  // champ — le geste "sélectionner puis cliquer sur Gras" ne marcherait
  // jamais sans ça.
  const toolbarButtonClass =
    "rounded-lg border border-zinc-200 p-1.5 text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-navy";
  function preventFocusSteal(e: MouseEvent) {
    e.preventDefault();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          title="Gras"
          onMouseDown={preventFocusSteal}
          onClick={() => wrapSelection("strong")}
          className={toolbarButtonClass}
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Italique"
          onMouseDown={preventFocusSteal}
          onClick={() => wrapSelection("em")}
          className={toolbarButtonClass}
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Surligner"
          onMouseDown={preventFocusSteal}
          onClick={() => wrapSelection("mark")}
          className={toolbarButtonClass}
        >
          <Highlighter className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="Effacer la mise en forme"
          onMouseDown={preventFocusSteal}
          onClick={clearFormatting}
          className={toolbarButtonClass}
        >
          <Eraser className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs text-zinc-400">
          Sélectionnez du texte, puis cliquez sur un bouton.
        </span>
      </div>
      <div
        ref={initEditor}
        contentEditable
        suppressContentEditableWarning
        onInput={syncFromDom}
        onPaste={handlePaste}
        className="min-h-[10rem] w-full whitespace-pre-wrap rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm outline-none focus:border-ubac-yellow"
      />
    </div>
  );
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

// Fond clair derrière un passage surligné dans le PDF — même geste que
// bg-ubac-yellow/60 à l'écran (globals.css), mais jsPDF ne comprend pas
// les couleurs avec transparence pour un simple rect(): ce ton est l'or de
// la marque (PDF_COLORS.gold) mélangé à du blanc à ~55%, calculé une fois
// pour donner visuellement le même résultat qu'à l'écran.
const PDF_HIGHLIGHT_BG: [number, number, number] = [249, 223, 141];

function pdfFontStyle(bold: boolean, italic: boolean) {
  if (bold && italic) return "bolditalic";
  if (bold) return "bold";
  if (italic) return "italic";
  return "normal";
}

// Un "atome" par mot (ou par unique bloc d'espaces, pour ne perdre aucune
// largeur entre deux mots) — c'est l'unité que le retour à la ligne manuel
// ci-dessous déplace d'une ligne à l'autre. `break` marque un vrai saut de
// ligne du texte d'origine (\n), toujours respecté même si la ligne
// n'était pas pleine.
type PdfAtom =
  | { text: string; bold: boolean; italic: boolean; highlight: boolean }
  | { break: true };

function reportRunsToPdfAtoms(runs: ReportRun[]): PdfAtom[] {
  const atoms: PdfAtom[] = [];
  runs.forEach((run) => {
    run.text.split("\n").forEach((paragraph, i) => {
      if (i > 0) atoms.push({ break: true });
      paragraph
        .split(/(\s+)/)
        .filter((piece) => piece.length > 0)
        .forEach((piece) => {
          atoms.push({ text: piece, bold: run.bold, italic: run.italic, highlight: run.highlight });
        });
    });
  });
  return atoms;
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
  const lineHeight = 6;
  const maxWidth = pageWidth - marginX * 2;
  doc.setFontSize(10);

  // Retour à la ligne manuel (jsPDF ne sait pas mettre en page du texte à
  // styles mixtes) : les atomes sont regroupés ligne par ligne selon leur
  // largeur réelle une fois le bon style appliqué avant chaque mesure —
  // doc.getTextWidth() lit la police actuellement sélectionnée.
  const atoms = reportRunsToPdfAtoms(parseReportRuns(report.body ?? ""));
  const lines: Exclude<PdfAtom, { break: true }>[][] = [];
  let current: Exclude<PdfAtom, { break: true }>[] = [];
  let currentWidth = 0;

  function widthOf(atom: Exclude<PdfAtom, { break: true }>) {
    doc.setFont("helvetica", pdfFontStyle(atom.bold, atom.italic));
    return doc.getTextWidth(atom.text);
  }
  function trimTrailingSpace(line: Exclude<PdfAtom, { break: true }>[]) {
    while (line.length > 0 && /^\s+$/.test(line[line.length - 1].text)) line.pop();
  }

  atoms.forEach((atom) => {
    if ("break" in atom) {
      trimTrailingSpace(current);
      lines.push(current);
      current = [];
      currentWidth = 0;
      return;
    }
    const isSpace = /^\s+$/.test(atom.text);
    if (current.length === 0 && isSpace) return; // jamais d'espace en début de ligne
    const w = widthOf(atom);
    if (current.length > 0 && currentWidth + w > maxWidth) {
      trimTrailingSpace(current);
      lines.push(current);
      current = [];
      currentWidth = 0;
      if (isSpace) return; // l'espace qui a provoqué le retour est inutile en début de ligne suivante
    }
    current.push(atom);
    currentWidth += w;
  });
  trimTrailingSpace(current);
  lines.push(current);

  lines.forEach((line) => {
    if (y > pageHeight - 16) {
      doc.addPage();
      y = 20;
    }
    let x = marginX;
    line.forEach((atom) => {
      doc.setFont("helvetica", pdfFontStyle(atom.bold, atom.italic));
      const w = doc.getTextWidth(atom.text);
      if (atom.highlight) {
        doc.setFillColor(...PDF_HIGHLIGHT_BG);
        doc.rect(x, y - 4.2, w, 5.3, "F");
      }
      doc.setTextColor(...PDF_COLORS.ink);
      doc.text(atom.text, x, y);
      x += w;
    });
    y += lineHeight;
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
                    <FormattedReportText text={detail.body ?? ""} />
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
              <ReportBodyEditor value={formBody} onChange={setFormBody} />
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
              <ReportBodyEditor value={formBody} onChange={setFormBody} />
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
