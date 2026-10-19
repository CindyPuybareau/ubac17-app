"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "./confirm-dialog";
import EmptyState from "./empty-state";
import type { AdminInventoryItem } from "./page";

type InventoryForm = {
  name: string;
  quantity: string;
};

const EMPTY_FORM: InventoryForm = { name: "", quantity: "1" };

function toForm(item: AdminInventoryItem): InventoryForm {
  return { name: item.name, quantity: String(item.quantity) };
}

// Retour de Cindy du 16/10 ("Inventaire") : liste libre de matériel club
// (nom + quantité), visible et modifiable par le Bureau ET les coachs (voir
// inventory_items, RLS is_club_admin() or is_coach_anywhere()). Même patron
// que SponsorsManager (sponsors-manager.tsx) pour l'écriture (router.refresh()
// après chaque succès), MAIS avec une copie locale affichée tout de suite
// (localItems, même principe que members-table.tsx) : retour de Cindy du
// 19/10 ("je clique sur supprimer ça ne supprime pas") -- la ligne restait
// affichée le temps que router.refresh() recharge la page (ralenti côté
// plateforme), ce qui l'a fait cliquer "Supprimer" une seconde fois sur une
// ligne déjà supprimée, d'où le message trompeur "bloqué par les droits
// d'accès" (0 ligne correspondante, pas un vrai refus RLS -- la policy ne
// dépend que de qui agit, jamais du contenu de la ligne).
export default function InventoryManager({ items }: { items: AdminInventoryItem[] }) {
  const router = useRouter();
  const [localItems, setLocalItems] = useState(items);
  useEffect(() => {
    setLocalItems(items);
  }, [items]);
  const [editing, setEditing] = useState<AdminInventoryItem | "new" | null>(null);
  const [form, setForm] = useState<InventoryForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminInventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  }

  function openEdit(item: AdminInventoryItem) {
    setForm(toForm(item));
    setError(null);
    setEditing(item);
  }

  function closeForm() {
    setEditing(null);
    setError(null);
  }

  async function save() {
    const name = form.name.trim();
    if (!name) {
      setError("Le nom du matériel est obligatoire.");
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
      setError("La quantité doit être un nombre entier positif.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = { name, quantity };
    const isEditingExisting = editing !== "new" && editing;
    const { error: writeError, data } = isEditingExisting
      ? await supabase
          .from("inventory_items")
          .update(payload)
          .eq("id", editing.id)
          .select("id, name, quantity")
      : await supabase.from("inventory_items").insert(payload).select("id, name, quantity");
    setSaving(false);
    if (writeError) {
      setError(`Enregistrement impossible : ${writeError.message}`);
      return;
    }
    const saved = data?.[0];
    if (!saved) {
      setError("Enregistrement impossible (droits d'accès). Réessaie.");
      return;
    }
    // Affichage immédiat (retour de Cindy du 19/10) : pas la peine d'attendre
    // router.refresh() pour voir le changement sur CET onglet -- il reste
    // appelé juste après pour que l'autre rôle (Bureau/Coach) le voie aussi
    // sans F5, via WATCHED_TABLES.
    setLocalItems((prev) =>
      isEditingExisting
        ? prev.map((i) => (i.id === saved.id ? saved : i))
        : [...prev, saved].sort((a, b) => a.name.localeCompare(b.name))
    );
    closeForm();
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.from("inventory_items").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      setError(`Suppression impossible : ${error.message}`);
      return;
    }
    // 0 ligne renvoyée ici veut dire "déjà supprimée" (par exemple un second
    // clic avant que router.refresh() n'ait retiré la carte), jamais un vrai
    // refus RLS -- la policy (is_club_admin() or is_coach_anywhere()) ne
    // dépend que de qui agit, jamais du contenu de la ligne. Traité comme un
    // succès idempotent plutôt qu'une erreur trompeuse.
    setLocalItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
    setDeleteTarget(null);
    router.refresh();
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
          {editing === "new" ? "Annuler" : "Ajouter du matériel"}
        </button>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Package className="h-3.5 w-3.5" />
          {localItems.length} article{localItems.length > 1 ? "s" : ""}
        </p>
      </div>

      {!editing && !deleteTarget && error && <p className="text-sm text-red-600">{error}</p>}

      {editing && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
            <Package className="h-4 w-4 shrink-0 text-zinc-500" />
            {editing === "new" ? "Ajouter du matériel" : `Modifier ${editing.name}`}
          </h3>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                Nom du matériel
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ballon de basket"
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">Quantité</label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="w-fit rounded-full bg-ubac-yellow px-4 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      )}

      {localItems.length === 0 ? (
        <EmptyState icon={Package} message="Aucun matériel enregistré pour le moment." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {localItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">
                  {item.name}
                </span>
                <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
                  Qté {item.quantity}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEdit(item)}
                  title="Modifier"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(item)}
                  title="Supprimer"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Supprimer ce matériel ?"
        message={`${deleteTarget?.name ?? ""} sera définitivement supprimé de l'inventaire.`}
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
