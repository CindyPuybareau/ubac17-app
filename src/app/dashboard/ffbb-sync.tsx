"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function FfbbSync({
  teamId,
  initialUrl,
}: {
  teamId: string;
  initialUrl: string | null;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveUrl() {
    setSaving(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase
      .from("teams")
      .update({ ffbb_url: url || null })
      .eq("id", teamId);

    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }
    setMessage("Lien enregistré.");
    router.refresh();
  }

  async function syncNow() {
    setSyncing(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch("/api/sync-ffbb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Échec de la synchronisation FFBB.");
        return;
      }

      setMessage(
        `${data.imported} nouveau(x), ${data.updated} mis à jour${
          data.skipped ? `, ${data.skipped} ignoré(s)` : ""
        }.`
      );
      router.refresh();
    } catch {
      setError("Échec de la synchronisation FFBB.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-orange-50 p-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-orange-700">
        Lien de la fiche équipe FFBB (competitions.ffbb.com)
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://competitions.ffbb.com/.../equipes/..."
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
        />
        <button
          onClick={saveUrl}
          disabled={saving}
          className="rounded-full border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-white disabled:opacity-60"
        >
          {saving ? "..." : "Enregistrer"}
        </button>
        <button
          onClick={syncNow}
          disabled={syncing || !initialUrl}
          className="rounded-full bg-orange-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:opacity-60"
        >
          {syncing ? "Synchronisation..." : "🔄 Synchroniser avec la FFBB"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
    </div>
  );
}
