"use client";

import { CalendarClock, CheckCircle2, Clock, TriangleAlert } from "lucide-react";
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
  const syncableTeams = teams.filter((t) => t.ffbb_url);

  return (
    <div className="flex flex-col gap-4">
      {/* Retour de Cindy du 01/10 ("les boutons de synchronisation ne
          servent plus à rien ?") : "Tout synchroniser" déclenchait le
          fetch depuis le serveur Vercel, toujours bloqué par la FFBB
          (BunnyCDN Shield, IP de datacenter) -- retiré au profit de la
          tâche planifiée locale (scripts/sync-ffbb-all.ts, chaque lundi
          10h, IP résidentielle jamais bloquée), dont le résultat se lit
          directement sur chaque fiche équipe ci-dessous ("Il y a X h"). */}
      {syncableTeams.length > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-zinc-100 bg-white p-4 text-sm text-zinc-600 shadow-sm">
          <CalendarClock className="h-4 w-4 shrink-0 text-ubac-yellow-dark" />
          Synchronisation automatique chaque lundi à 10h, depuis un ordinateur du
          club — voir la date ci-dessous sur chaque équipe.
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
