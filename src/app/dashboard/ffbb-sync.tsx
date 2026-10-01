"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Retour de Cindy du 01/10 ("les boutons de synchronisation ne servent
// plus à rien ?") : le bouton "Synchroniser avec la FFBB" déclenchait
// toujours le fetch depuis le SERVEUR (route.ts), jamais depuis
// l'ordinateur de qui cliquait -- déjà systématiquement bloqué en
// production par la FFBB (BunnyCDN Shield, IP de datacenter), quel que
// soit le visiteur. Retiré : la synchro réelle tourne désormais depuis une
// tâche planifiée locale (scripts/sync-ffbb-all.ts, chaque lundi), ce
// champ ne sert plus qu'à enregistrer le lien de la fiche équipe (lu par
// cette tâche ET par le lien "Voir sur FFBB" du calendrier).
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

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-ubac-yellow/10 p-3">
      <label className="text-xs font-semibold uppercase tracking-wide text-ubac-yellow-dark">
        Lien de la fiche équipe FFBB (competitions.ffbb.com)
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://competitions.ffbb.com/.../equipes/..."
          className="min-w-[200px] flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
        />
        <button
          onClick={saveUrl}
          disabled={saving}
          className="rounded-full border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-white disabled:opacity-60"
        >
          {saving ? "..." : "Enregistrer"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && <p className="text-sm text-green-600">{message}</p>}
    </div>
  );
}
