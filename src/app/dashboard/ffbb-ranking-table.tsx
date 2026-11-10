import { ListOrdered, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { FfbbRankingEntry } from "@/lib/ffbb";
import { FFBB_PHASE_2, type FfbbPhase } from "@/lib/ffbb-phase";

// Retour de Cindy du 01/10 ("le classement apparaisse dans le tableau de
// bord aussi") : rendu extrait tel quel de calendar-view.tsx (Matchs &
// Résultats), désormais partagé avec space-dashboard-summary.tsx -- une
// seule version des positions/flèches de tendance/surlignage de l'équipe
// UBAC à maintenir, peu importe où le classement s'affiche.
export default function FfbbRankingTable({
  entries,
  label,
  phase,
}: {
  entries: FfbbRankingEntry[];
  // Nom de secours si aucune ligne n'est marquée isOwnTeam (ne devrait pas
  // arriver en pratique, la FFBB marque toujours l'équipe consultée).
  label?: string;
  // Retour de Cindy du 09/11 ("le classement correspond à quoi, phase 2 ?
  // ce serait bien de l'indiquer") : retour de Cindy du 28/10 (voir
  // space-dashboard.ts) avait volontairement écarté un vrai sélecteur
  // Phase 1/Phase 2 ici, faute de place pour un onglet -- cette vignette
  // montre déjà toujours la phase la plus récente, juste sans le dire.
  // Un simple badge (pas un sélecteur) règle la demande sans revenir sur
  // ce choix : rien sous Phase 1 (valeur implicite, l'immense majorité des
  // classements toute l'année), "Phase 2" seulement une fois celle-ci
  // commencée.
  phase?: FfbbPhase;
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
      {/* Retour de Cindy du 10/11 ("phase 2 sur mobile ne va pas en
          responsive") : "Classement — ANGOULINS UBAC" (texte brut, pas de
          span propre) et le badge "Phase 2" vivaient comme deux items d'un
          même flex row -- une fois le nom long assez pour passer à la
          ligne, le badge restait "accroché" au milieu du texte replié au
          lieu de descendre proprement dessous. Titre+icône isolés dans
          leur propre span (qui peut replier son texte sans toucher au
          badge), badge à part avec shrink-0, flex-wrap sur la ligne entière
          pour qu'il tombe sous le titre si la place manque. */}
      <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-zinc-900">
        <span className="flex items-center gap-2">
          <ListOrdered className="h-4 w-4 shrink-0 text-navy" />
          Classement{cardLabel}
        </span>
        {phase === FFBB_PHASE_2 && (
          <span className="shrink-0 rounded-full bg-ubac-yellow/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ubac-yellow-dark">
            Phase 2
          </span>
        )}
      </p>
      <div className="flex flex-col gap-1">
        {entries.map((entry) => {
          const positionNumber = Number(entry.position);
          const trend =
            entry.previousRanking != null && !Number.isNaN(positionNumber)
              ? entry.previousRanking - positionNumber
              : 0;
          return (
            // Retour de Cindy du 10/11 ("le nom des équipes dans le
            // classement aussi coupé, police plus petite peut-être ?") :
            // text-sm -> text-xs et gap-2 -> gap-1.5 sur toute la ligne
            // (pas seulement le nom) pour garder tout aligné -- rend
            // quelques caractères de plus visibles avant la troncature
            // (toujours nécessaire, certains noms FFBB restent trop longs
            // pour tenir en entier sur mobile, ex. "IE - CTC NORD
            // ROCHELAIS BASKET - SAINT-XANDRE").
            <div
              key={`${entry.position}-${entry.label}`}
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs ${
                entry.isOwnTeam ? "bg-court-green/10 font-semibold text-court-green" : "text-zinc-700"
              }`}
            >
              <span className="w-4 shrink-0 text-center tabular-nums text-zinc-500">{entry.position}</span>
              {trend > 0 ? (
                <TrendingUp className="h-3 w-3 shrink-0 text-emerald-500" />
              ) : trend < 0 ? (
                <TrendingDown className="h-3 w-3 shrink-0 text-red-500" />
              ) : (
                <Minus className="h-3 w-3 shrink-0 text-zinc-300" />
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
