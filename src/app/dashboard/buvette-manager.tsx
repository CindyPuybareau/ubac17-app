"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatLocalDateFr } from "@/lib/local-date";
import { formatAmount } from "./cotisation-shared";
import EmptyState from "./empty-state";
import type { AdminBuvette } from "./page";

type BuvetteForm = {
  buvetteDate: string;
  cardAmount: string;
  cashAmount: string;
  notes: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM: BuvetteForm = {
  buvetteDate: todayIso(),
  cardAmount: "",
  cashAmount: "",
  notes: "",
};

function toForm(b: AdminBuvette): BuvetteForm {
  return {
    buvetteDate: b.buvetteDate ?? todayIso(),
    cardAmount: String(b.cardAmount),
    cashAmount: String(b.cashAmount),
    notes: b.notes ?? "",
  };
}

// Retour de Cindy du 25/10 ("le comptable puisse ajouter tel jour : X € en
// CB/Sumup, X € en espèces") : suivi financier indépendant, Bureau seul --
// même patron que penalites-manager.tsx (un seul modal réutilisé add/edit,
// garde-fou RLS explicite sur la suppression), jamais lié à un joueur.
export default function BuvetteManager({ buvette }: { buvette: AdminBuvette[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminBuvette | "new" | null>(null);
  const [form, setForm] = useState<BuvetteForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminBuvette | null>(null);

  const totals = useMemo(
    () =>
      buvette.reduce(
        (acc, b) => ({
          card: acc.card + b.cardAmount,
          cash: acc.cash + b.cashAmount,
        }),
        { card: 0, cash: 0 }
      ),
    [buvette]
  );

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setEditing("new");
  }

  function openEdit(b: AdminBuvette) {
    setForm(toForm(b));
    setError(null);
    setEditing(b);
  }

  async function save() {
    const cardNum = Number(form.cardAmount.replace(",", ".") || "0");
    const cashNum = Number(form.cashAmount.replace(",", ".") || "0");
    if (Number.isNaN(cardNum) || Number.isNaN(cashNum)) {
      setError("Montant invalide.");
      return;
    }
    if (cardNum === 0 && cashNum === 0) {
      setError("Renseigne au moins un montant (CB ou espèces).");
      return;
    }
    if (!form.buvetteDate) {
      setError("Choisis une date.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      buvette_date: form.buvetteDate,
      card_amount: cardNum,
      cash_amount: cashNum,
      notes: form.notes.trim() || null,
    };
    const { error: writeError } =
      editing !== "new" && editing
        ? await supabase.from("buvette_entries").update(payload).eq("id", editing.id)
        : await supabase.from("buvette_entries").insert(payload);
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
    setError(null);
    const supabase = createClient();
    // Même garde-fou qu'ailleurs dans ce menu (penalites-manager.tsx,
    // audit du 31/08) : une suppression bloquée par RLS ne remonte pas
    // forcément d'erreur -- vérifier explicitement le nombre de lignes
    // affectées plutôt que de croire à tort que ça a marché.
    const { error, data } = await supabase
      .from("buvette_entries")
      .delete()
      .eq("id", deleteTarget.id)
      .select("id");
    setSaving(false);
    if (error) {
      setError(`Suppression impossible : ${error.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setError("Suppression bloquée par les droits d'accès (RLS). Réessaie.");
      return;
    }
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openNew}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
        >
          <Plus className="h-4 w-4" />
          Ajouter une recette
        </button>
        {buvette.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <Coffee className="h-3.5 w-3.5" />
            {buvette.length} entrée{buvette.length > 1 ? "s" : ""}
            <span className="rounded-full bg-court-green/10 px-2 py-0.5 text-[11px] font-bold text-court-green">
              {formatAmount(totals.card)} CB
            </span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-700">
              {formatAmount(totals.cash)} espèces
            </span>
            <span className="rounded-full bg-navy/10 px-2 py-0.5 text-[11px] font-bold text-navy">
              {formatAmount(totals.card + totals.cash)} au total
            </span>
          </p>
        )}
      </div>

      {buvette.length === 0 ? (
        <EmptyState icon={Coffee} message="Aucune recette buvette enregistrée pour le moment." />
      ) : (
        <div className="flex flex-col gap-1.5">
          {buvette.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-100 bg-white p-3.5 shadow-sm"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-zinc-900">
                  {b.buvetteDate ? formatLocalDateFr(b.buvetteDate) : ""}
                </span>
                {b.notes && <span className="text-xs text-zinc-500">{b.notes}</span>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-court-green/10 px-2.5 py-0.5 text-xs font-bold text-court-green">
                  {formatAmount(b.cardAmount)} CB
                </span>
                <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                  {formatAmount(b.cashAmount)} espèces
                </span>
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
                  onClick={() => setDeleteTarget(b)}
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
                <Coffee className="h-4 w-4 shrink-0 text-zinc-500" />
                {editing === "new" ? "Ajouter une recette" : "Modifier la recette"}
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
                <label className="mb-1 block text-xs font-medium text-zinc-600">Date</label>
                <input
                  type="date"
                  value={form.buvetteDate}
                  onChange={(e) => setForm((f) => ({ ...f, buvetteDate: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Montant CB / Sumup (€)
                </label>
                <input
                  inputMode="decimal"
                  value={form.cardAmount}
                  onChange={(e) => setForm((f) => ({ ...f, cardAmount: e.target.value }))}
                  placeholder="ex. 80"
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Montant Espèces (€)
                </label>
                <input
                  inputMode="decimal"
                  value={form.cashAmount}
                  onChange={(e) => setForm((f) => ({ ...f, cashAmount: e.target.value }))}
                  placeholder="ex. 35"
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Notes (optionnel)
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="ex. Tournoi U13"
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
            <h3 className="mb-2 font-semibold text-zinc-900">Supprimer cette recette ?</h3>
            <p className="mb-4 text-sm text-zinc-500">
              La recette du{" "}
              {deleteTarget.buvetteDate ? formatLocalDateFr(deleteTarget.buvetteDate) : "jour"} (
              {formatAmount(deleteTarget.cardAmount + deleteTarget.cashAmount)}) sera
              définitivement supprimée.
            </p>
            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
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
