import { ListOrdered, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { FfbbRankingEntry } from "@/lib/ffbb";

// Retour de Cindy du 01/10 ("le classement apparaisse dans le tableau de
// bord aussi") : rendu extrait tel quel de calendar-view.tsx (Matchs &
// Résultats), désormais partagé avec space-dashboard-summary.tsx -- une
// seule version des positions/flèches de tendance/surlignage de l'équipe
// UBAC à maintenir, peu importe où le classement s'affiche.
export default function FfbbRankingTable({
  entries,
  label,
}: {
  entries: FfbbRankingEntry[];
  // Nom de secours si aucune ligne n'est marquée isOwnTeam (ne devrait pas
  // arriver en pratique, la FFBB marque toujours l'équipe consultée).
  label?: string;
}) {
  if (entries.length === 0) return null;

  // Le nom affiché ici vient de la FFBB elle-même (ligne "isOwnTeam" du
  // classement) plutôt que du nom interne U13M-1/U13M-2 : la FFBB
  // distingue déjà clairement ses propres équipes d'un même club (ex.
  // "... - 2").
  const ownEntry = entries.find((e) => e.isOwnTeam);
  const cardLabel = ownEntry ? ` — ${ownEntry.label}` : label ? ` — ${label}` : "";

  return (
    <div className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <ListOrdered className="h-4 w-4 shrink-0 text-navy" />
        Classement{cardLabel}
      </p>
      <div className="flex flex-col gap-1">
        {entries.map((entry) => {
          const positionNumber = Number(entry.position);
          const trend =
            entry.previousRanking != null && !Number.isNaN(positionNumber)
              ? entry.previousRanking - positionNumber
              : 0;
          return (
            <div
              key={`${entry.position}-${entry.label}`}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                entry.isOwnTeam ? "bg-court-green/10 font-semibold text-court-green" : "text-zinc-700"
              }`}
            >
              <span className="w-5 shrink-0 text-center tabular-nums text-zinc-500">{entry.position}</span>
              {trend > 0 ? (
                <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-500" />
              ) : (
                <Minus className="h-3.5 w-3.5 shrink-0 text-zinc-300" />
              )}
              <span className="flex-1 truncate">{entry.label}</span>
              <span className="shrink-0 tabular-nums text-zinc-500">{entry.points} pts</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
