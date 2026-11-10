"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Megaphone, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resizeImageForHighlight } from "@/lib/image-resize";
import { formatLocalDateFr } from "@/lib/local-date";
import ConfirmDialog from "./confirm-dialog";
import EmptyState from "./empty-state";
import SelectDropdown from "./select-dropdown";
import type { AdminFeaturedHighlight, AdminUpcomingEvent } from "./page";

type HighlightForm = {
  title: string;
  imageUrl: string;
  linkUrl: string;
  eventId: string;
  endDate: string;
};

const EMPTY_FORM: HighlightForm = {
  title: "",
  imageUrl: "",
  linkUrl: "",
  eventId: "",
  endDate: "",
};

function toForm(h: AdminFeaturedHighlight): HighlightForm {
  return {
    title: h.title,
    imageUrl: h.imageUrl ?? "",
    linkUrl: h.linkUrl ?? "",
    eventId: h.eventId ?? "",
    endDate: h.endDate ?? "",
  };
}

// Retour de Cindy du 10/11 ("Événements à la une") : même habillage
// "liste + formulaire en ligne" que SponsorsManager (sponsors-
// manager.tsx), seul autre écran de gestion Bureau-only avec image +
// réordonnancement -- une seule implémentation de ce patron à
// maintenir dans l'esprit, pas une 3e variante inventée ici. Différences :
// titre (jamais de nom de sponsor), lien externe générique (jamais un
// "site web"), rattachement optionnel à un événement du calendrier
// (SelectDropdown, eventOptions) et date de fin de validité plutôt
// qu'une date de renouvellement.
export default function FeaturedHighlightsManager({
  highlights,
  eventOptions,
}: {
  highlights: AdminFeaturedHighlight[];
  eventOptions: AdminUpcomingEvent[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<AdminFeaturedHighlight | "new" | null>(null);
  const [form, setForm] = useState<HighlightForm>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminFeaturedHighlight | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const active = highlights.filter((h) => !h.endDate || h.endDate >= today);
  const expired = highlights.filter((h) => h.endDate && h.endDate < today);

  // Retour de Cindy du 10/11 ("il y en a trop, les entraînements n'ont
  // pas besoin d'apparaître... juste ceux de type 'Événement club'") :
  // une affiche à la une n'a de sens que pour un vrai événement club
  // entier (loto, tournoi, soirée...), jamais un entraînement/match
  // précis d'une équipe -- même type "OTHER" que celui réservé à
  // "Événement club" dans create-event-form.tsx/event-style.ts.
  // L'événement déjà rattaché (cas édition) reste toujours proposé même
  // s'il n'est plus de type OTHER ou est passé, sinon son libellé
  // disparaîtrait du formulaire d'édition existant.
  const sortedEventOptions = eventOptions
    .filter((e) => e.event_type === "OTHER" || e.id === form.eventId)
    .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const eventSelectOptions = [
    { value: "", label: "Aucun événement rattaché" },
    ...sortedEventOptions.map((e) => ({
      value: e.id,
      label: `${e.title ?? "Événement"} — ${new Date(e.start_time).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "short",
      })}`,
    })),
  ];

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  }

  function openEdit(h: AdminFeaturedHighlight) {
    setForm(toForm(h));
    setError(null);
    setEditing(h);
  }

  function closeForm() {
    setEditing(null);
    setError(null);
  }

  async function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
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
      const { blob, ext } = await resizeImageForHighlight(file);
      const supabase = createClient();
      // Nom de fichier unique (horodatage), même raison que
      // sponsors-manager.tsx : plusieurs affiches coexistent dans le même
      // bucket, pas de chemin stable tant qu'il n'y a pas encore d'id
      // (cas de la création).
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("featured-highlights")
        .upload(path, blob, { contentType: blob.type || file.type });
      if (uploadError) {
        setError("Envoi de l'image impossible, réessaie.");
        return;
      }
      const { data } = supabase.storage.from("featured-highlights").getPublicUrl(path);
      setForm((f) => ({ ...f, imageUrl: data.publicUrl }));
    } catch {
      setError("Image illisible, réessaie avec une autre.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!form.title.trim()) {
      setError("Le titre est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      title: form.title.trim(),
      image_url: form.imageUrl || null,
      link_url: form.linkUrl.trim() || null,
      event_id: form.eventId || null,
      end_date: form.endDate || null,
    };
    const { error: writeError } =
      editing !== "new" && editing
        ? await supabase.from("featured_highlights").update(payload).eq("id", editing.id)
        : // Nouvelle affiche : ajoutée à la fin de l'ordre d'affichage,
          // même raison que sponsors-manager.tsx (sort_order=0 l'aurait
          // fait sauter en première position).
          await supabase.from("featured_highlights").insert({
            ...payload,
            sort_order: Math.max(0, ...highlights.map((h) => h.sortOrder)) + 1,
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
    setError(null);
    const supabase = createClient();
    const { error, data } = await supabase
      .from("featured_highlights")
      .delete()
      .eq("id", deleteTarget.id)
      .select("id");
    if (error) {
      setDeleting(false);
      setError(`Suppression impossible : ${error.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setDeleting(false);
      setError("Suppression bloquée par les droits d'accès (RLS). Réessaie.");
      return;
    }
    // Best-effort, même principe que sponsors-manager.tsx : l'image reste
    // orpheline dans le bucket si cet appel échoue, mais la suppression
    // de l'affiche elle-même est déjà actée ci-dessus.
    const imagePath = deleteTarget.imageUrl?.split("/featured-highlights/")[1];
    if (imagePath) {
      const { error: removeError } = await supabase.storage
        .from("featured-highlights")
        .remove([imagePath]);
      if (removeError) {
        console.error("[featured-highlights-manager] suppression de l'image échouée:", removeError);
      }
    }
    setDeleting(false);
    setDeleteTarget(null);
    router.refresh();
  }

  // Même mécanique que sponsors-manager.tsx : flèches plutôt que
  // glisser-déposer (fiable sur mobile), échange de sort_order entre
  // voisins directs dans la liste déjà triée.
  async function moveHighlight(list: AdminFeaturedHighlight[], index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const current = list[index];
    const neighbor = list[targetIndex];
    setMovingId(current.id);
    setError(null);
    const supabase = createClient();
    const [a, b] = await Promise.all([
      supabase
        .from("featured_highlights")
        .update({ sort_order: neighbor.sortOrder })
        .eq("id", current.id)
        .select("id"),
      supabase
        .from("featured_highlights")
        .update({ sort_order: current.sortOrder })
        .eq("id", neighbor.id)
        .select("id"),
    ]);
    setMovingId(null);
    const err = a.error ?? b.error;
    if (err) {
      setError(`Réordonnancement impossible : ${err.message}`);
      return;
    }
    if ((a.data?.length ?? 0) === 0 || (b.data?.length ?? 0) === 0) {
      setError("Réordonnancement bloqué par les droits d'accès (RLS). Réessaie.");
      return;
    }
    router.refresh();
  }

  function renderCard(h: AdminFeaturedHighlight, index: number, list: AdminFeaturedHighlight[]) {
    return (
      <div
        key={h.id}
        className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {h.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={h.imageUrl}
                alt=""
                className="h-14 w-11 shrink-0 rounded-md border border-zinc-100 object-cover"
              />
            ) : (
              <div className="flex h-14 w-11 shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-200 text-zinc-300">
                <Megaphone className="h-4 w-4" />
              </div>
            )}
            <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">{h.title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => moveHighlight(list, index, -1)}
              disabled={index === 0 || movingId !== null}
              title="Faire remonter"
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => moveHighlight(list, index, 1)}
              disabled={index === list.length - 1 || movingId !== null}
              title="Faire descendre"
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => openEdit(h)}
              title="Modifier"
              className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(h)}
              title="Supprimer"
              className="flex h-7 w-7 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {h.endDate && (
            <span className="w-fit rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
              Jusqu&apos;au {formatLocalDateFr(h.endDate)}
            </span>
          )}
          {h.eventTitle && (
            <span className="w-fit rounded-full bg-navy/10 px-2.5 py-0.5 text-xs font-semibold text-navy">
              {h.eventTitle}
            </span>
          )}
          {h.linkUrl && (
            <span className="w-fit rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Lien externe
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (editing ? closeForm() : openNew())}
          className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
        >
          {editing === "new" ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing === "new" ? "Annuler" : "Ajouter une affiche"}
        </button>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Megaphone className="h-3.5 w-3.5" />
          {active.length} active{active.length > 1 ? "s" : ""}
        </p>
      </div>

      {!editing && !deleteTarget && error && <p className="text-sm text-red-600">{error}</p>}

      {editing && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
            <Megaphone className="h-4 w-4 shrink-0 text-zinc-500" />
            {editing === "new" ? "Ajouter une affiche" : `Modifier ${editing.title}`}
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Titre</label>
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">Image</label>
              <div className="flex items-center gap-3">
                {form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={form.imageUrl}
                    alt=""
                    className="h-20 w-16 rounded-lg border border-zinc-100 object-cover"
                  />
                ) : (
                  <div className="flex h-20 w-16 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-zinc-300">
                    <Megaphone className="h-6 w-6" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? "Envoi..." : form.imageUrl ? "Changer l'image" : "Ajouter une image"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onImageChange}
                  className="hidden"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Lien externe (optionnel)
              </label>
              <input
                type="url"
                placeholder="https://..."
                value={form.linkUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Date de fin (optionnelle)
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Rattacher à un événement du calendrier (optionnel)
              </label>
              <SelectDropdown
                options={eventSelectOptions}
                value={form.eventId}
                onChange={(v) => setForm((f) => ({ ...f, eventId: v }))}
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

      {highlights.length === 0 ? (
        <EmptyState icon={Megaphone} message="Aucune affiche enregistrée pour le moment." />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((h, i) => renderCard(h, i, active))}
          </div>

          {expired.length > 0 && (
            <details className="rounded-2xl border border-zinc-100 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-zinc-600">
                Expirées ({expired.length})
              </summary>
              <div className="grid grid-cols-1 gap-3 border-t border-zinc-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {expired.map((h, i) => renderCard(h, i, expired))}
              </div>
            </details>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer cette affiche ?"
        message={`"${deleteTarget?.title ?? ""}" sera définitivement supprimée, y compris son image.`}
        confirmLabel="Supprimer"
        pending={deleting}
        pendingLabel="Suppression..."
        error={deleteTarget ? error : null}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setError(null);
        }}
      />
    </div>
  );
}
