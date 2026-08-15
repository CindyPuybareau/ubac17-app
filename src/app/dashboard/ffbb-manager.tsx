"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, RefreshCw, TriangleAlert } from "lucide-react";
import FfbbSync from "./ffbb-sync";

type TeamRef = {
  id: string;
  name: string | null;
  category: string | null;
  ffbb_url: string | null;
  ffbb_last_synced_at?: string | null;
};

// "Il y a 3 jours", "à l'instant"... — mêmes seuils que le reste de
// l'appli (jour civil, pas 24h glissantes) pour rester cohérent avec le
// vocabulaire déjà utilisé ailleurs (calendrier, anniversaires).
function relativeSync(iso: string | null | undefined): { label: string; stale: boolean } {
  if (!iso) return { label: "Jamais synchronisé", stale: true };
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const diffH = Math.floor(diffMs / (3600 * 1000));
  if (diffH < 1) return { label: "À l'instant", stale: false };
  if (diffH < 24) return { label: `Il y a ${diffH} h`, stale: false };
  const diffD = Math.floor(diffH / 24);
  // Au-delà d'une semaine sans synchro, une fiche FFBB a probablement
  // bougé (score, horaire déplacé...) sans que personne ne le sache ici.
  return { label: `Il y a ${diffD} j`, stale: diffD > 7 };
}

export default function FfbbManager({ teams }: { teams: TeamRef[] }) {
  const router = useRouter();
  const [syncingAll, setSyncingAll] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const syncableTeams = teams.filter((t) => t.ffbb_url);

  async function syncAll() {
    setSyncingAll(true);
    setSummary(null);
    let okCount = 0;
    let failCount = 0;
    // Séquentiel plutôt qu'en parallèle : évite de bombarder la FFBB de
    // 14 requêtes simultanées (risque de blocage/rate-limit côté serveur
    // FFBB), un délai de quelques secondes total est largement acceptable
    // pour une action volontaire du Bureau.
    for (const team of syncableTeams) {
      try {
        const res = await fetch("/api/sync-ffbb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ teamId: team.id }),
        });
        if (res.ok) okCount += 1;
        else failCount += 1;
      } catch {
        failCount += 1;
      }
    }
    setSyncingAll(false);
    setSummary(
      failCount === 0
        ? `${okCount} équipe${okCount > 1 ? "s" : ""} synchronisée${okCount > 1 ? "s" : ""}.`
        : `${okCount} synchronisée${okCount > 1 ? "s" : ""}, ${failCount} en échec.`
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {syncableTeams.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
          <button
            onClick={syncAll}
            disabled={syncingAll}
            className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${syncingAll ? "animate-spin" : ""}`} />
            {syncingAll ? "Synchronisation en cours..." : "Tout synchroniser"}
          </button>
          <span className="text-xs text-zinc-400">
            {syncableTeams.length} équipe{syncableTeams.length > 1 ? "s" : ""} avec un lien FFBB
            configuré
          </span>
          {summary && <span className="text-xs font-semibold text-navy">{summary}</span>}
        </div>
      )}

      {teams.map((team) => {
        const sync = relativeSync(team.ffbb_last_synced_at);
        return (
          <div
            key={team.id}
            className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-zinc-900">
                {team.name}
                {team.category && team.category !== team.name ? ` · ${team.category}` : ""}
              </h3>
              {team.ffbb_url && (
                <span
                  className={`flex items-center gap-1 whitespace-nowrap text-xs font-medium ${
                    sync.stale ? "text-amber-700" : "text-zinc-400"
                  }`}
                >
                  {sync.stale ? (
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  )}
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {sync.label}
                </span>
              )}
            </div>
            <div className="mt-3">
              <FfbbSync teamId={team.id} initialUrl={team.ffbb_url} />
            </div>
          </div>
        );
      })}
      {teams.length === 0 && (
        <p className="text-sm text-zinc-500">Aucune équipe pour le moment.</p>
      )}
    </div>
  );
}
