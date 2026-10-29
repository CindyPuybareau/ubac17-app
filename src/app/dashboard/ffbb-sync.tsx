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
// Retour de Cindy du 28/10 ("phase 1 -> phase 2 pour U18 à U9") : les
// deux champs vivent côte à côte dans la même carte, chacun avec son
// propre bouton Enregistrer -- jamais couplés (on peut très bien remplir
// la phase 2 des semaines après la phase 1, ou ne jamais la remplir pour
// une équipe qui n'a qu'une seule phase, Séniors 1/2 notamment). Dès que
// le lien Phase 2 est renseigné, la tâche automatique
// (scripts/sync-ffbb-all.ts) arrête de relire la phase 1 pour cette
// équipe -- son classement/ses matchs restent gelés tels quels pour
// toujours, voir la migration ffbb_phase2.
function FfbbUrlField({
  teamId,
  column,
  initialUrl,
  label,
  helperText,
}: {
  teamId: string;
  column: "ffbb_url" | "ffbb_url_phase2";
  initialUrl: string | null;
  label: string;
  helperText?: string;
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
      .update({ [column]: url || null })
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
        {label}
      </label>
      {helperText && <p className="text-xs text-zinc-500">{helperText}</p>}
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

export default function FfbbSync({
  teamId,
  initialUrl,
  initialUrlPhase2,
}: {
  teamId: string;
  initialUrl: string | null;
  initialUrlPhase2?: string | null;
}) {
  return (
    <div className="flex flex-col gap-2">
      <FfbbUrlField
        teamId={teamId}
        column="ffbb_url"
        initialUrl={initialUrl}
        label="Lien de la fiche équipe FFBB — Phase 1 (competitions.ffbb.com)"
      />
      <FfbbUrlField
        teamId={teamId}
        column="ffbb_url_phase2"
        initialUrl={initialUrlPhase2 ?? null}
        label="Lien de la fiche équipe FFBB — Phase 2"
        helperText="À remplir seulement une fois la phase 2 publiée par la FFBB pour cette équipe (reclassement U18 à U9) — laisser vide sinon, y compris pour les Séniors."
      />
    </div>
  );
}
