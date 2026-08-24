"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatLocalDateFr } from "@/lib/local-date";
import EmptyState from "./empty-state";
import type { AdminSponsor } from "./page";

type SponsorForm = {
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  renewalDate: string;
  notes: string;
};

const EMPTY_FORM: SponsorForm = {
  name: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  renewalDate: "",
  notes: "",
};

function toForm(sponsor: AdminSponsor): SponsorForm {
  return {
    name: sponsor.name,
    contactName: sponsor.contactName ?? "",
    contactEmail: sponsor.contactEmail ?? "",
    contactPhone: sponsor.contactPhone ?? "",
    renewalDate: sponsor.renewalDate ?? "",
    notes: sponsor.notes ?? "",
  };
}

// Retour de Cindy du 2026-08-22 : la carte "Documents à renouveler" du
// tableau de bord Bureau devient "Renouvellement Sponsors" — jusqu'ici
// l'appli ne suivait aucune donnée sponsor du tout (aucune table), donc un
// vrai écran de gestion (ajouter/modifier/supprimer) est nécessaire pour
// que la carte compte quelque chose de réel. Même famille de composant que
// whatsapp-groups-manager.tsx : un formulaire modal réutilisé pour créer ET
// modifier.
export default function SponsorsManager({ sponsors }: { sponsors: AdminSponsor[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminSponsor | "new" | null>(null);
  const [form, setForm] = useState<SponsorForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminSponsor | null>(null);

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  }

  function openEdit(sponsor: AdminSponsor) {
    setForm(toForm(sponsor));
    setError(null);
    setEditing(sponsor);
  }

  async function save() {
    if (!form.name.trim()) {
      setError("Le nom du sponsor est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      contact_name: form.contactName.trim() || null,
      contact_email: form.contactEmail.trim() || null,
      contact_phone: form.contactPhone.trim() || null,
      renewal_date: form.renewalDate || null,
      notes: form.notes.trim() || null,
    };
    const { error: writeError } =
      editing !== "new" && editing
        ? await supabase.from("sponsors").update(payload).eq("id", editing.id)
        : await supabase.from("sponsors").insert(payload);
    setSaving(false);
    if (writeError) {
      setError("Enregistrement impossible, réessaie.");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("sponsors").delete().eq("id", deleteTarget.id);
    setSaving(false);
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Handshake className="h-3.5 w-3.5" />
          {sponsors.length} sponsor{sponsors.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
        >
          <Plus className="h-4 w-4" />
          Ajouter un sponsor
        </button>
      </div>

      {sponsors.length === 0 ? (
        <EmptyState icon={Handshake} message="Aucun sponsor enregistré pour le moment." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sponsors.map((sponsor) => {
            const contact = [sponsor.contactName, sponsor.contactEmail, sponsor.contactPhone]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={sponsor.id}
                className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">
                    {sponsor.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openEdit(sponsor)}
                      title="Modifier"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(sponsor)}
                      title="Supprimer"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {sponsor.renewalDate && (
                  <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
                    Renouvellement : {formatLocalDateFr(sponsor.renewalDate)}
                  </span>
                )}
                {contact && <p className="text-xs text-zinc-500">{contact}</p>}
                {sponsor.notes && <p className="text-xs text-zinc-400">{sponsor.notes}</p>}
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
                <Handshake className="h-4 w-4 shrink-0 text-zinc-500" />
                {editing === "new" ? "Ajouter un sponsor" : "Modifier le sponsor"}
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
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Nom du sponsor
                </label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Date de renouvellement
                </label>
                <input
                  type="date"
                  value={form.renewalDate}
                  onChange={(e) => setForm((f) => ({ ...f, renewalDate: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Nom du contact
                </label>
                <input
                  value={form.contactName}
                  onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Email</label>
                <input
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Téléphone</label>
                <input
                  type="tel"
                  value={form.contactPhone}
                  onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
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

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-2 font-semibold text-zinc-900">Supprimer ce sponsor ?</h3>
            <p className="mb-4 text-sm text-zinc-500">
              {deleteTarget.name} sera définitivement supprimé de la liste.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={saving}
                className="flex-1 rounded-full border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmDelete}
                disabled={saving}
                className="flex-1 rounded-full bg-red-500 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {saving ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
