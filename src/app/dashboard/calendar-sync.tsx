"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CalendarSync({
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
      .update({ calendar_url: url || null })
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
      const res = await fetch("/api/sync-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Échec de la synchronisation.");
        return;
      }

      setMessage(
        `${data.imported} nouveau(x), ${data.updated} mis à jour.`
      );
      router.refresh();
    } catch {
      setError("Échec de la synchronisation.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        Lien du calendrier FFBB / iCal
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://.../calendar.ics"
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
          className="rounded-full bg-ubac-blue px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-ubac-blue-dark disabled:opacity-60"
        >
          {syncing ? "Synchronisation..." : "🔄 Synchroniser le planning maintenant"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
    </div>
  );
}
