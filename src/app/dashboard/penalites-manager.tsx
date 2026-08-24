"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Pencil, Plus, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatLocalDateFr } from "@/lib/local-date";
import { formatAmount } from "./cotisation-shared";
import EmptyState from "./empty-state";
import type { AdminMember, AdminPenalite } from "./page";

type PenaliteForm = {
  playerId: string;
  amount: string;
  penaliteDate: string;
  notes: string;
  statut: "EN_ATTENTE" | "PAYE";
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM: PenaliteForm = {
  playerId: "",
  amount: "",
  penaliteDate: todayIso(),
  notes: "",
  statut: "EN_ATTENTE",
};

function toForm(p: AdminPenalite): PenaliteForm {
  return {
    playerId: p.playerId,
    amount: String(p.amount),
    penaliteDate: p.penaliteDate ?? todayIso(),
    notes: p.notes ?? "",
    statut: p.statut === "PAYE" ? "PAYE" : "EN_ATTENTE",
  };
}

// Une faute technique sifflée par un arbitre coûte au club, qui la
// répercute ensuite sur le joueur responsable (retour de Cindy du
// 2026-08-22) — onglet à côté de "Stages & Événements Payants" plutôt
// qu'un sous-onglet de Cotisations & Licences : ce n'est pas une cotisation
// de saison, juste un montant ponctuel rattaché à UN joueur.
export default function PenalitesManager({
  penalites,
  members,
}: {
  penalites: AdminPenalite[];
  members: AdminMember[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminPenalite | "new" | null>(null);
  const [form, setForm] = useState<PenaliteForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPenalite | null>(null);

  const activeMembers = useMemo(
    () =>
      [...members]
        .filter((m) => !m.archivedAt)
        .sort((a, b) =>
          `${a.lastName ?? ""} ${a.firstName ?? ""}`.localeCompare(
            `${b.lastName ?? ""} ${b.firstName ?? ""}`
          )
        ),
    [members]
  );

  const totalDue = useMemo(
    () => penalites.filter((p) => p.statut !== "PAYE").reduce((sum, p) => sum + p.amount, 0),
    [penalites]
  );

  function openNew() {
    setForm({ ...EMPTY_FORM, playerId: activeMembers[0]?.id ?? "" });
    setError(null);
    setEditing("new");
  }

  function openEdit(p: AdminPenalite) {
    setForm(toForm(p));
    setError(null);
    setEditing(p);
  }

  async function save() {
    if (!form.playerId) {
      setError("Choisis un joueur.");
      return;
    }
    const amountNum = Number(form.amount.replace(",", "."));
    if (!form.amount || Number.isNaN(amountNum) || amountNum <= 0) {
      setError("Montant invalide.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      player_id: form.playerId,
      amount: amountNum,
      penalite_date: form.penaliteDate || todayIso(),
      notes: form.notes.trim() || null,
      statut: form.statut,
      paid_at: form.statut === "PAYE" ? new Date().toISOString() : null,
    };
    const { error: writeError } =
      editing !== "new" && editing
        ? await supabase.from("penalites").update(payload).eq("id", editing.id)
        : await supabase.from("penalites").insert(payload);
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
    await supabase.from("penalites").delete().eq("id", deleteTarget.id);
    setSaving(false);
    setDeleteTarget(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Gavel className="h-3.5 w-3.5" />
          {penalites.length} pénalité{penalites.length > 1 ? "s" : ""}
          {totalDue > 0 && (
            <span className="ml-1.5 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
              {formatAmount(totalDue)} restant à encaisser
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
        >
          <Plus className="h-4 w-4" />
          Ajouter une pénalité
        </button>
      </div>

      {penalites.length === 0 ? (
        <EmptyState icon={Gavel} message="Aucune pénalité enregistrée pour le moment." />
      ) : (
        <div className="flex flex-col gap-1.5">
          {penalites.map((p) => (
            <div
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-100 bg-white p-3.5 shadow-sm"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-semibold text-zinc-900">
                  {p.playerName}
                </span>
                <span className="text-xs text-zinc-500">
                  {p.penaliteDate ? formatLocalDateFr(p.penaliteDate) : ""}
                  {p.notes ? ` · ${p.notes}` : ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    p.statut === "PAYE"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-rose-100 text-rose-700"
                  }`}
                >
                  {formatAmount(p.amount)}
                  {p.statut === "PAYE" ? " · Payée" : " · En attente"}
                </span>
                <button
                  type="button"
                  onClick={() => openEdit(p)}
                  title="Modifier"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(p)}
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
                <Gavel className="h-4 w-4 shrink-0 text-zinc-500" />
                {editing === "new" ? "Ajouter une pénalité" : "Modifier la pénalité"}
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
                <label className="mb-1 block text-xs font-medium text-zinc-600">Joueur</label>
                <select
                  value={form.playerId}
                  onChange={(e) => setForm((f) => ({ ...f, playerId: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                >
                  {activeMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.lastName} {m.firstName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Montant (€)</label>
                <input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="ex. 15"
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Date</label>
                <input
                  type="date"
                  value={form.penaliteDate}
                  onChange={(e) => setForm((f) => ({ ...f, penaliteDate: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Motif / notes
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="ex. Faute technique — match vs XYZ"
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Statut</label>
                <select
                  value={form.statut}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, statut: e.target.value as "EN_ATTENTE" | "PAYE" }))
                  }
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                >
                  <option value="EN_ATTENTE">En attente</option>
                  <option value="PAYE">Payée</option>
                </select>
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
            <h3 className="mb-2 font-semibold text-zinc-900">Supprimer cette pénalité ?</h3>
            <p className="mb-4 text-sm text-zinc-500">
              La pénalité de {deleteTarget.playerName} ({formatAmount(deleteTarget.amount)}) sera
              définitivement supprimée.
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
