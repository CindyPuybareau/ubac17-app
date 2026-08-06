"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { AdminCategoryTariff, AdminMemberTeam } from "./page";

// Bureau-editable default price per category — feeds the DB trigger
// (sync_category_cotisation) that auto-creates a cotisation row whenever a
// member is created or (re)assigned to a team. Collapsed by default: this
// is a one-time/rare setup screen, not something the Bureau opens daily.
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

  const uniqueCategories = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    categories.forEach((c) => {
      if (c.category && !seen.has(c.category)) {
        seen.add(c.category);
        list.push(c.category);
      }
    });
    return list.sort((a, b) => a.localeCompare(b, "fr"));
  }, [categories]);

  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    uniqueCategories.forEach((c) => {
      initial[c] = tariffByCategory.get(c) != null ? String(tariffByCategory.get(c)) : "";
    });
    return initial;
  });

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
      .map((c) => ({ category: c, prix: values[c] }))
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
    <div className="rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <Settings className="h-4 w-4 text-zinc-400" />
          Tarifs par catégorie
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        )}
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-zinc-100 px-4 py-3">
          <p className="text-xs text-zinc-500">
            Ce tarif est appliqué automatiquement à la cotisation créée dès qu&apos;un
            membre est ajouté ou assigné à cette catégorie.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {uniqueCategories.map((c) => (
              <label key={c} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-zinc-600">{c}</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    value={values[c] ?? ""}
                    onChange={(e) => setValue(c, e.target.value)}
                    placeholder="—"
                    className="w-20 rounded-lg border border-zinc-200 px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-zinc-400">€</span>
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
