"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, HeartHandshake, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "./confirm-dialog";
import EmptyState from "./empty-state";
import type { AdminBenevole } from "./page";

type BenevoleForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
};

const EMPTY_FORM: BenevoleForm = { firstName: "", lastName: "", phone: "", email: "", notes: "" };

function toForm(b: AdminBenevole): BenevoleForm {
  return {
    firstName: b.firstName,
    lastName: b.lastName,
    phone: b.phone ?? "",
    email: b.email ?? "",
    notes: b.notes ?? "",
  };
}

// Retour de Cindy du 2026-08-25 : des personnes qui aident le Bureau sur
// l'organisation d'un événement sans être joueur, ni Bureau, ni forcément
// parent d'un joueur du club — jamais de lien avec les cotisations ni
// l'effectif d'une équipe (voir la migration 20261027000000_benevoles.sql).
// Même famille de composant que sponsors-manager.tsx (formulaire modal
// réutilisé pour créer ET modifier), avec en plus le lien privé d'accès
// (voir /benevole/[token]/route.ts) à copier-coller pour l'envoyer par
// SMS/e-mail — jamais affiché nulle part ailleurs que sur cette fiche,
// aucun autre moyen de le retrouver si perdu (il faudrait le régénérer).
export default function BenevolesManager({ benevoles }: { benevoles: AdminBenevole[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminBenevole | "new" | null>(null);
  const [form, setForm] = useState<BenevoleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminBenevole | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const visible = benevoles.filter((b) => showArchived || !b.archivedAt);

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  }

  function openEdit(b: AdminBenevole) {
    setForm(toForm(b));
    setError(null);
    setEditing(b);
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Prénom et nom sont obligatoires.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    };
    const { error: writeError } =
      editing !== "new" && editing
        ? await supabase.from("benevoles").update(payload).eq("id", editing.id)
        : await supabase.from("benevoles").insert(payload);
    setSaving(false);
    if (writeError) {
      setError("Enregistrement impossible, réessaie.");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // Audit du 31/08 : ni erreur ni ligne affectée n'étaient vérifiées.
    const { error: writeError, data } = await supabase
      .from("benevoles")
      .update({ archived_at: archiveTarget.archivedAt ? null : new Date().toISOString() })
      .eq("id", archiveTarget.id)
      .select("id");
    setSaving(false);
    if (writeError) {
      setError(`Action impossible : ${writeError.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setError("Action bloquée par les droits d'accès (RLS). Réessaie.");
      return;
    }
    setArchiveTarget(null);
    router.refresh();
  }

  async function copyLink(b: AdminBenevole) {
    const link = `${window.location.origin}/benevole/${b.accessToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(b.id);
      setTimeout(() => setCopiedId((id) => (id === b.id ? null : id)), 2000);
    } catch {
      setError("Copie impossible, copie le lien à la main.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action principale à gauche, avant le reste (retour de Cindy du
          2026-08-22 sur "Créer un événement" — même convention reprise
          ici : le bouton d'ajout passe avant les filtres/compteur, pas
          après). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
        >
          <HeartHandshake className="h-4 w-4" />
          Ajouter un bénévole
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
            />
            Afficher les retirés
          </label>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <HeartHandshake className="h-3.5 w-3.5" />
            {visible.length} bénévole{visible.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={HeartHandshake} message="Aucun bénévole enregistré pour le moment." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((b) => {
            const contact = [b.phone, b.email].filter(Boolean).join(" · ");
            return (
              <div
                key={b.id}
                className={`flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm ${
                  b.archivedAt ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">
                    {b.firstName} {b.lastName}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(b)}
                      title="Modifier"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setArchiveTarget(b)}
                      title={b.archivedAt ? "Réactiver" : "Retirer"}
                      className={`flex h-7 w-7 items-center justify-center rounded-full ${
                        b.archivedAt
                          ? "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                          : "text-red-400 hover:bg-red-50 hover:text-red-600"
                      }`}
                    >
                      {b.archivedAt ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
                {contact && <p className="text-xs text-zinc-500">{contact}</p>}
                {b.notes && <p className="text-xs text-zinc-400">{b.notes}</p>}
                <button
                  type="button"
                  onClick={() => copyLink(b)}
                  className="mt-1 flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
                >
                  {copiedId === b.id ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Lien copié
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copier son lien privé
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setEditing(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <HeartHandshake className="h-4 w-4 shrink-0 text-zinc-500" />
                {editing === "new" ? "Ajouter un bénévole" : "Modifier le bénévole"}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Prénom</label>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Nom</label>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Téléphone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Ex. disponible le week-end seulement"
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
            <button
              onClick={save}
              disabled={saving}
              className="mt-3 w-full rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}

      {/* ConfirmDialog (audit du 31/08) au lieu d'une modale maison
          recopiant la même structure que confirmDelete/archiveTarget
          ailleurs dans l'appli — voir confirm-dialog.tsx. */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={archiveTarget?.archivedAt ? "Réactiver ce bénévole ?" : "Retirer ce bénévole ?"}
        message={
          archiveTarget?.archivedAt
            ? `${archiveTarget.firstName} ${archiveTarget.lastName} réapparaîtra dans la liste et pourra à nouveau être invité(e) à un événement.`
            : `${archiveTarget?.firstName} ${archiveTarget?.lastName} ne sera plus invité(e) à de nouveaux événements. Son lien cessera de fonctionner, mais son historique reste conservé.`
        }
        confirmLabel={archiveTarget?.archivedAt ? "Réactiver" : "Retirer"}
        pending={saving}
        pendingLabel="..."
        destructive={!archiveTarget?.archivedAt}
        error={archiveTarget ? error : null}
        onConfirm={confirmArchive}
        onCancel={() => {
          setArchiveTarget(null);
          setError(null);
        }}
      />
    </div>
  );
}
