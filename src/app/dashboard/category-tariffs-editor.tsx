"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronUp, Pencil, Settings, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ConfirmDialog from "./confirm-dialog";
import type { AdminCategoryTariff, AdminMemberTeam } from "./page";

function buildValues(
  categories: string[],
  tariffByCategory: Map<string, number | null>
) {
  const initial: Record<string, string> = {};
  categories.forEach((c) => {
    const prix = tariffByCategory.get(c);
    initial[c] = prix != null ? String(prix) : "";
  });
  return initial;
}

// Bureau-editable default price per category — feeds the DB trigger
// (sync_category_cotisation) that auto-creates a cotisation row whenever a
// member is created or (re)assigned to a team. Collapsed by default so the
// Cotisations tab opens straight onto the members table: setting tariffs is
// a rare setup step, consulting the table is the daily one. The header
// still shows how many are defined, so a missing tariff stays visible
// without expanding.
export default function CategoryTariffsEditor({
  categories,
  tariffs,
}: {
  categories: AdminMemberTeam[];
  tariffs: AdminCategoryTariff[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const tariffByCategory = useMemo(
    () => new Map(tariffs.map((t) => [t.category, t.prix])),
    [tariffs]
  );

  // Union of the categories that currently have a team AND the ones that
  // already have a saved price: a tariff whose category no longer matches
  // an active team (renamed, archived, legacy) must stay visible and
  // editable rather than silently vanishing from the panel.
  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    categories.forEach((c) => {
      if (c.category && !seen.has(c.category)) {
        seen.add(c.category);
        list.push(c.category);
      }
    });
    tariffs.forEach((t) => {
      if (t.category && !seen.has(t.category)) {
        seen.add(t.category);
        list.push(t.category);
      }
    });
    return list.sort((a, b) => a.localeCompare(b, "fr"));
  }, [categories, tariffs]);

  const [values, setValues] = useState<Record<string, string>>(() =>
    buildValues(uniqueCategories, tariffByCategory)
  );

  // Re-sync when the saved tariffs actually change (own save, another
  // Bureau member's edit picked up by RealtimeSync). Keyed on a signature
  // so the frequent unrelated router.refresh() calls never wipe an edit in
  // progress.
  const tariffSignature = useMemo(
    () =>
      tariffs
        .map((t) => `${t.category}:${t.prix ?? ""}`)
        .sort()
        .join("|"),
    [tariffs]
  );
  const [syncedSignature, setSyncedSignature] = useState(tariffSignature);
  if (syncedSignature !== tariffSignature) {
    setSyncedSignature(tariffSignature);
    setValues(buildValues(uniqueCategories, tariffByCategory));
  }

  const definedCount = uniqueCategories.filter(
    (c) => (values[c] ?? "").trim() !== ""
  ).length;
  const missingCategories = uniqueCategories.filter((c) => tariffByCategory.get(c) == null);

  function setValue(category: string, value: string) {
    setValues((v) => ({ ...v, [category]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const supabase = createClient();
    const rows = uniqueCategories
      .map((c) => ({ category: c, prix: values[c] ?? "" }))
      .filter((r) => r.prix.trim() !== "" && !Number.isNaN(Number(r.prix)))
      .map((r) => ({ category: r.category, prix: Number(r.prix) }));

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("category_tariffs")
        .upsert(rows, { onConflict: "category" });
      if (upsertError) {
        setSaving(false);
        setError(upsertError.message);
        return;
      }
    }
    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  // Renommer une catégorie (retour de Cindy du 20/11, demande du comptable
  // "U9 Mixte" -> "U9X") : crayon à côté du nom, puis confirmation --
  // fonction rename_team_category (migration 20261121140000), tout ou rien.
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [confirmRename, setConfirmRename] = useState<{ from: string; to: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  function askRename(from: string) {
    const to = newName.trim();
    setRenameError(null);
    if (!to || to === from) {
      setEditingCategory(null);
      return;
    }
    const taken = uniqueCategories.some((c) => c !== from && c.toLowerCase() === to.toLowerCase());
    if (taken) {
      setRenameError(`La catégorie « ${to} » existe déjà.`);
      return;
    }
    setConfirmRename({ from, to });
  }

  async function doRename() {
    if (!confirmRename) return;
    setRenaming(true);
    setRenameError(null);
    const { error: rpcError } = await createClient().rpc("rename_team_category", {
      old_name: confirmRename.from,
      new_name: confirmRename.to,
    });
    setRenaming(false);
    if (rpcError) {
      setRenameError(rpcError.message);
      setConfirmRename(null);
      return;
    }
    setConfirmRename(null);
    setEditingCategory(null);
    router.refresh();
  }

  const teamsInCategory = (category: string) => categories.filter((t) => t.category === category).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-ubac-yellow/15 px-4 py-3.5 text-left transition-colors hover:bg-ubac-yellow/25"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ubac-yellow text-navy">
            <Settings className="h-4 w-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-lg font-bold text-navy">
              Tarifs par catégorie
            </span>
            <span className="text-xs font-medium text-zinc-500">
              {definedCount} tarif{definedCount > 1 ? "s" : ""} défini
              {definedCount > 1 ? "s" : ""} sur {uniqueCategories.length} catégories
            </span>
            {/* Retour de Cindy du 18/11 : la catégorie sans tarif nommée
                tout de suite, sans déplier -- un membre affecté à une
                catégorie sans tarif reçoit une cotisation à 0 €, donc
                "Payé" sans aucun versement. */}
            {missingCategories.length > 0 && (
              <span className="text-xs font-semibold text-amber-700">
                Sans tarif : {missingCategories.join(", ")}
              </span>
            )}
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-navy/15 bg-white text-navy">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-zinc-100 px-4 py-4">
          <p className="text-xs text-zinc-500">
            Ce tarif est appliqué automatiquement à la cotisation créée dès qu&apos;un
            membre est ajouté ou assigné à cette catégorie.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {renameError && <p className="text-sm font-semibold text-red-600">{renameError}</p>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {uniqueCategories.map((c) => (
              <div
                key={c}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-slate-50 p-2.5 transition-colors focus-within:border-ubac-yellow"
              >
                {editingCategory === c ? (
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") askRename(c);
                        if (e.key === "Escape") setEditingCategory(null);
                      }}
                      aria-label={`Nouveau nom pour « ${c} »`}
                      className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm font-medium text-slate-800 outline-none focus:border-navy"
                    />
                    <button
                      type="button"
                      onClick={() => askRename(c)}
                      title="Valider le nouveau nom"
                      className="shrink-0 rounded-full p-1.5 text-court-green hover:bg-court-green/10"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(null);
                        setRenameError(null);
                      }}
                      title="Annuler"
                      className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="min-w-0 truncate text-sm font-medium text-slate-800">{c}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(c);
                        setNewName(c);
                        setRenameError(null);
                      }}
                      title={`Renommer « ${c} »`}
                      className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-navy"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
                {editingCategory !== c && (
                <span className="flex shrink-0 items-center gap-0.5 rounded-md border border-zinc-200 bg-white pr-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={values[c] ?? ""}
                    onChange={(e) => setValue(c, e.target.value)}
                    placeholder="—"
                    className="w-16 bg-transparent px-2 py-1 text-right text-sm font-semibold text-navy outline-none"
                  />
                  <span className="text-xs font-semibold text-zinc-400">€</span>
                </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-fit rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {saving ? "Enregistrement..." : "Enregistrer les tarifs"}
            </button>
            {saved && <span className="text-xs font-medium text-green-600">Enregistré !</span>}
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirmRename !== null}
        title="Renommer la catégorie ?"
        message={
          confirmRename
            ? `« ${confirmRename.from} » deviendra « ${confirmRename.to} » partout dans l'appli : ${teamsInCategory(confirmRename.from)} équipe${teamsInCategory(confirmRename.from) > 1 ? "s" : ""} (et ses déclinaisons numérotées), le tarif et les fiches joueurs. Les anciennes notifications gardent l'ancien nom.`
            : ""
        }
        confirmLabel="Renommer"
        pending={renaming}
        pendingLabel="Renommage..."
        onCancel={() => setConfirmRename(null)}
        onConfirm={doRename}
      />
    </div>
  );
}
