"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Lock, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ClubReport } from "./page";
import ConfirmDialog from "./confirm-dialog";

// Comptes rendus CD17/Ligue (retour de Cindy du 2026-09-01, construits en
// dernier comme convenu) : contrairement à Mairies/Bureau/Coachs (texte
// rédigé dans l'appli, voir club-reports-section.tsx), c'est un vrai
// document REÇU de l'extérieur — on ne le retape pas, on le dépose tel
// quel. Le contenu reste non modifiable/non remplaçable pour toujours
// (aucun bouton "Modifier", aucune policy UPDATE côté base) : on supprime
// et on redépose, on ne corrige jamais un CD17/Ligue en place. La
// suppression, elle, est possible pour le Bureau (retour de Cindy du
// 2026-09-02, "ce serait bien de pouvoir supprimer le fichier quand
// même" — le verrouillage total du premier jet était trop strict pour
// rattraper une erreur de dépôt) — voir migration 20260902000000.

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo, même limite que le bucket

export default function Cd17LigueSection({
  canUpload,
  reports,
}: {
  // Même personne (Bureau) qui dépose et qui peut supprimer — un seul
  // booléen suffit, pas besoin d'un second canDelete distinct.
  canUpload: boolean;
  reports: ClubReport[];
}) {
  const router = useRouter();
  const list = reports.filter((r) => r.category === "CD17_LIGUE");

  const [uploading, setUploading] = useState(false);
  const [formTitle, setFormTitle] = useState("");
  const [formDate, setFormDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClubReport | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openUpload() {
    setFormTitle("");
    setFormDate(new Date().toISOString().slice(0, 10));
    setFile(null);
    setError(null);
    setUploading(true);
  }

  async function confirmUpload() {
    if (!formTitle.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    if (!file) {
      setError("Choisis un fichier à déposer.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Fichier trop volumineux (10 Mo maximum).");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]+/g, "_");
    const path = `${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage
      .from("club-report-files")
      .upload(path, file);
    if (uploadError) {
      setSaving(false);
      setError(`Dépôt impossible : ${uploadError.message}`);
      return;
    }
    const { error: insertError } = await supabase.from("club_reports").insert({
      category: "CD17_LIGUE",
      title: formTitle.trim(),
      report_date: formDate,
      file_path: path,
      created_by: userData.user?.id ?? null,
    });
    setSaving(false);
    if (insertError) {
      // Le fichier est déjà déposé mais la fiche n'a pas pu être créée —
      // le Bureau peut retrouver et supprimer ce fichier orphelin via la
      // liste "Storage" du tableau de bord Supabase (rien dans l'appli ne
      // référence encore ce chemin), mais elle a besoin de savoir que ça
      // n'a pas marché plutôt que de croire que c'est fait.
      console.error("[cd17-ligue-section] création de la fiche échouée après dépôt:", insertError);
      setError(`Le fichier est déposé, mais la fiche n'a pas pu être créée : ${insertError.message}`);
      return;
    }
    setUploading(false);
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
    if (deleteError) {
      setDeleting(false);
      console.error("[cd17-ligue-section] suppression échouée:", deleteError);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setDeleting(false);
      console.error("[cd17-ligue-section] suppression bloquée par les droits d'accès (RLS).");
      return;
    }
    // Best-effort : la fiche est déjà supprimée ci-dessus, un échec ici
    // laisserait juste le fichier orphelin dans le bucket (même principe
    // que sponsors-manager.tsx pour les logos) — jamais bloquant pour la
    // personne.
    if (deleteTarget.filePath) {
      const { error: removeError } = await supabase.storage
        .from("club-report-files")
        .remove([deleteTarget.filePath]);
      if (removeError) {
        console.error("[cd17-ligue-section] suppression du fichier échouée:", removeError);
      }
    }
    setDeleting(false);
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
          <FileText className="h-4 w-4 shrink-0 text-navy" />
          Comptes rendus CD17 / Ligue
        </p>
        {canUpload && (
          <button
            type="button"
            onClick={openUpload}
            className="flex items-center gap-1 rounded-full bg-ubac-yellow px-2.5 py-1 text-xs font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" />
            Déposer
          </button>
        )}
      </div>
      <div className="flex flex-col">
        {list.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-zinc-400">
            Aucun document CD17/Ligue pour le moment.
          </p>
        )}
        {list.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between gap-2 border-b border-zinc-50 px-4 py-2.5 last:border-b-0"
          >
            <span className="min-w-0 truncate text-sm font-medium text-zinc-800">{r.title}</span>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-xs text-zinc-400">
                {new Date(r.reportDate).toLocaleDateString("fr-FR")}
              </span>
              {/* Lien direct déjà prêt (URL signée générée côté serveur,
                  voir page.tsx) — jamais une navigation déclenchée après
                  un clic, qui se ferait bloquer par le bloqueur de popup
                  sur iPhone. */}
              {r.fileUrl ? (
                <a
                  href={r.fileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-navy/5 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/10"
                >
                  Ouvrir
                </a>
              ) : (
                <span className="text-xs text-zinc-300">Lien indisponible</span>
              )}
              {canUpload && (
                <button
                  type="button"
                  onClick={() => setDeleteTarget(r)}
                  aria-label="Supprimer"
                  className="rounded-full p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {uploading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-900">Déposer — CD17 / Ligue</h3>
              <button
                onClick={() => setUploading(false)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Une fois déposé, ce document ne pourra plus jamais être remplacé ni supprimé,
                  même par le Bureau — vérifie le fichier avant de valider.
                </span>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Titre</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Courrier CD17 - rentrée 2026"
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
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Fichier (PDF, JPEG ou PNG, 10 Mo maximum)
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={confirmUpload}
                  disabled={saving}
                  className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                  {saving ? "Dépôt en cours..." : "Déposer définitivement"}
                </button>
                <button
                  type="button"
                  onClick={() => setUploading(false)}
                  className="rounded-full px-3.5 py-1.5 text-sm font-semibold text-zinc-500 hover:bg-zinc-100"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Supprimer ce document ?"
        message={
          deleteTarget
            ? `« ${deleteTarget.title} » sera définitivement supprimé.`
            : ""
        }
        confirmLabel="Supprimer"
        pending={deleting}
        pendingLabel="Suppression..."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
