"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {uniqueCategories.map((c) => (
              <label
                key={c}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-slate-50 p-2.5 transition-colors focus-within:border-ubac-yellow"
              >
                <span className="min-w-0 truncate text-sm font-medium text-slate-800">
                  {c}
                </span>
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
              </label>
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
    </div>
  );
}
