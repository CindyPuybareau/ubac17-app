"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Handshake, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resizeImageForLogo } from "@/lib/image-resize";
import { formatLocalDateFr } from "@/lib/local-date";
import ConfirmDialog from "./confirm-dialog";
import EmptyState from "./empty-state";
import type { AdminSponsor } from "./page";

type ContractType = "500_1AN" | "500_2ANS" | "1000_1AN" | "1000_2ANS";

// Retour de Cindy du 29/08 : 4 formules fixes seulement, jamais un montant
// libre — ce que le club propose réellement aux sponsors.
const CONTRACT_LABELS: Record<ContractType, string> = {
  "500_1AN": "500 € / 1 an",
  "500_2ANS": "500 € / 2 ans",
  "1000_1AN": "1 000 € / 1 an",
  "1000_2ANS": "1 000 € / 2 ans",
};

type SponsorForm = {
  name: string;
  logoUrl: string;
  websiteUrl: string;
  contractType: ContractType | "";
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  renewalDate: string;
  notes: string;
};

const EMPTY_FORM: SponsorForm = {
  name: "",
  logoUrl: "",
  websiteUrl: "",
  contractType: "",
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  renewalDate: "",
  notes: "",
};

function toForm(sponsor: AdminSponsor): SponsorForm {
  return {
    name: sponsor.name,
    logoUrl: sponsor.logoUrl ?? "",
    websiteUrl: sponsor.websiteUrl ?? "",
    contractType: (sponsor.contractType as ContractType | null) ?? "",
    contactName: sponsor.contactName ?? "",
    contactEmail: sponsor.contactEmail ?? "",
    contactPhone: sponsor.contactPhone ?? "",
    renewalDate: sponsor.renewalDate ?? "",
    notes: sponsor.notes ?? "",
  };
}

// Retour de Cindy du 29/08 : même habillage "pleine page" que "Créer un
// événement" (create-event-form.tsx) plutôt qu'une petite fenêtre modale —
// un vrai formulaire, pas une case à remplir en vitesse. Logo/lien/contrat
// ajoutés : le logo (+ le nom, en dessous) s'affiche désormais dans tous
// les espaces (voir sponsors-display.tsx) via la vue publique
// sponsor_display, qui ne porte jamais le contrat ni les coordonnées de
// contact — ces deux-là restent strictement dans cet écran, Bureau
// uniquement.
export default function SponsorsManager({ sponsors }: { sponsors: AdminSponsor[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<AdminSponsor | "new" | null>(null);
  const [form, setForm] = useState<SponsorForm>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminSponsor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

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

  function closeForm() {
    setEditing(null);
    setError(null);
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choisis une image.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const { blob, ext } = await resizeImageForLogo(file);
      const supabase = createClient();
      // Nom de fichier unique (horodatage) plutôt qu'un upsert sur un chemin
      // fixe : contrairement à un avatar (un seul propriétaire, un seul
      // fichier), plusieurs sponsors coexistent dans le même bucket — pas
      // de nom stable à réutiliser par sponsor tant qu'il n'a pas encore
      // d'id (cas de la création).
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("sponsor-logos")
        .upload(path, blob, { contentType: blob.type || file.type });
      if (uploadError) {
        setError("Envoi du logo impossible, réessaie.");
        return;
      }
      const { data } = supabase.storage.from("sponsor-logos").getPublicUrl(path);
      setForm((f) => ({ ...f, logoUrl: data.publicUrl }));
    } catch {
      setError("Image illisible, réessaie avec une autre.");
    } finally {
      setUploading(false);
    }
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
      logo_url: form.logoUrl || null,
      website_url: form.websiteUrl.trim() || null,
      contract_type: form.contractType || null,
      contact_name: form.contactName.trim() || null,
      contact_email: form.contactEmail.trim() || null,
      contact_phone: form.contactPhone.trim() || null,
      renewal_date: form.renewalDate || null,
      notes: form.notes.trim() || null,
    };
    const { error: writeError } =
      editing !== "new" && editing
        ? await supabase.from("sponsors").update(payload).eq("id", editing.id)
        : // Nouveau sponsor : ajouté à la fin de l'ordre d'affichage plutôt
          // que sort_order par défaut (0), qui l'aurait fait sauter en
          // première position devant tous les autres.
          await supabase.from("sponsors").insert({
            ...payload,
            sort_order: Math.max(0, ...sponsors.map((s) => s.sortOrder)) + 1,
          });
    setSaving(false);
    if (writeError) {
      setError("Enregistrement impossible, réessaie.");
      return;
    }
    closeForm();
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const supabase = createClient();
    await supabase.from("sponsors").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    setDeleteTarget(null);
    router.refresh();
  }

  // Retour de Cindy du 29/08 : deux flèches plutôt qu'un glisser-déposer —
  // plus simple à coder, et surtout fiable sur téléphone (le glisser-
  // déposer tactile se comporte mal sur mobile). `sponsors` est déjà trié
  // par sort_order (voir la requête dans page.tsx), donc "voisin" ici veut
  // dire littéralement l'élément juste avant/après dans ce tableau — un
  // simple échange de sort_order entre les deux suffit.
  async function moveSponsor(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sponsors.length) return;
    const current = sponsors[index];
    const neighbor = sponsors[targetIndex];
    setMovingId(current.id);
    const supabase = createClient();
    await Promise.all([
      supabase.from("sponsors").update({ sort_order: neighbor.sortOrder }).eq("id", current.id),
      supabase.from("sponsors").update({ sort_order: current.sortOrder }).eq("id", neighbor.id),
    ]);
    setMovingId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Retour de Cindy du 29/08 : bouton d'ajout à gauche, nombre à
          droite — même convention que "Ajouter un membre" (members-
          table.tsx), pas l'inverse comme précédemment sur cet écran. */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (editing ? closeForm() : openNew())}
          className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
        >
          {editing === "new" ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing === "new" ? "Annuler" : "Ajouter un sponsor"}
        </button>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Handshake className="h-3.5 w-3.5" />
          {sponsors.length} sponsor{sponsors.length > 1 ? "s" : ""}
        </p>
      </div>

      {editing && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
            <Handshake className="h-4 w-4 shrink-0 text-zinc-500" />
            {editing === "new" ? "Ajouter un sponsor" : `Modifier ${editing.name}`}
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Nom du sponsor
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Logo</label>
              <div className="flex items-center gap-3">
                {form.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.logoUrl}
                    alt=""
                    className="h-16 w-24 rounded-lg border border-zinc-100 object-contain p-1"
                  />
                ) : (
                  <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-300">
                    <Handshake className="h-6 w-6" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Envoi..." : form.logoUrl ? "Changer le logo" : "Ajouter un logo"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onLogoChange}
                  className="hidden"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Lien vers le site
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={form.websiteUrl}
                onChange={(e) => setForm((f) => ({ ...f, websiteUrl: e.target.value }))}
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

            <div className="sm:col-span-2">
              {/* Réservé à cet écran (Bureau) : jamais exposé via
                  sponsor_display, donc jamais visible de Coach/Famille/
                  Enfant ni du site public. */}
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Contrat (non visible en dehors du Bureau)
              </label>
              <select
                value={form.contractType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contractType: e.target.value as ContractType | "" }))
                }
                className="w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm"
              >
                <option value="">Aucun contrat renseigné</option>
                {(Object.keys(CONTRACT_LABELS) as ContractType[]).map((key) => (
                  <option key={key} value={key}>
                    {CONTRACT_LABELS[key]}
                  </option>
                ))}
              </select>
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
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={saving || uploading}
            className="w-fit rounded-full bg-ubac-yellow px-4 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      )}

      {sponsors.length === 0 ? (
        <EmptyState icon={Handshake} message="Aucun sponsor enregistré pour le moment." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sponsors.map((sponsor, index) => {
            const contact = [sponsor.contactName, sponsor.contactEmail, sponsor.contactPhone]
              .filter(Boolean)
              .join(" · ");
            return (
              <div
                key={sponsor.id}
                className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {sponsor.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={sponsor.logoUrl}
                        alt=""
                        className="h-10 w-14 shrink-0 rounded-md border border-zinc-100 object-contain p-0.5"
                      />
                    ) : (
                      <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-200 text-zinc-300">
                        <Handshake className="h-4 w-4" />
                      </div>
                    )}
                    <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">
                      {sponsor.name}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveSponsor(index, -1)}
                      disabled={index === 0 || movingId !== null}
                      title="Faire remonter"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveSponsor(index, 1)}
                      disabled={index === sponsors.length - 1 || movingId !== null}
                      title="Faire descendre"
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
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
                <div className="flex flex-wrap gap-1.5">
                  {sponsor.renewalDate && (
                    <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
                      Renouvellement : {formatLocalDateFr(sponsor.renewalDate)}
                    </span>
                  )}
                  {sponsor.contractType && (
                    <span className="w-fit rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                      {CONTRACT_LABELS[sponsor.contractType as ContractType] ?? sponsor.contractType}
                    </span>
                  )}
                </div>
                {contact && <p className="text-xs text-zinc-500">{contact}</p>}
                {sponsor.notes && <p className="text-xs text-zinc-400">{sponsor.notes}</p>}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer ce sponsor ?"
        message={`${deleteTarget?.name ?? ""} sera définitivement supprimé de la liste, y compris son logo.`}
        confirmLabel="Supprimer"
        pending={deleting}
        pendingLabel="Suppression..."
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
