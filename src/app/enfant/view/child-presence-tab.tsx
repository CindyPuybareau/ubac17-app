import { Handshake, Sparkles, Trophy } from "lucide-react";
import { AttendanceHero, PresenceTiles } from "@/app/dashboard/attendance-hero";
import type { ChildAttendanceStats } from "./child-dashboard";

// Remplace l'ancien onglet "Défis" (badges à débloquer, jugé trop
// enfantin) : de vrais compteurs d'assiduité, calculés côté serveur
// (page.tsx, fonction season_participation, saison en cours). Matchs
// officiels/amicaux/tournois séparés (retour de Cindy du 24/09).
//
// Retour de Cindy du 13/11 ("un peu de fun") : même bandeau que le Bilan
// de la saison et le tableau de bord -- anneau de progression, verdict
// encourageant -- puis les matchs en cases à icône.
export default function ChildPresenceTab({
  trainings,
  official,
  friendly,
  tournament,
}: {
  trainings: ChildAttendanceStats;
  official: ChildAttendanceStats;
  friendly: ChildAttendanceStats;
  tournament: ChildAttendanceStats;
}) {
  const rate = trainings.total > 0 ? (trainings.present / trainings.total) * 100 : null;
  const hasMatches = official.total + friendly.total + tournament.total > 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <AttendanceHero
        title="Mes entraînements de la saison"
        rate={rate}
        tone="personal"
        subtitle={
          trainings.total > 0
            ? `${trainings.present} présence${trainings.present > 1 ? "s" : ""} sur ${trainings.total} entraînement${trainings.total > 1 ? "s" : ""}`
            : "Aucun entraînement passé pour le moment"
        }
      />
      {hasMatches && (
        <div className="flex flex-col gap-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Mes matchs</p>
          <PresenceTiles
            tiles={[
              {
                key: "official",
                label: "Officiels",
                present: official.present,
                total: official.total,
                icon: <Trophy className="h-3.5 w-3.5" />,
                toneClassName: "bg-navy/10 text-navy",
              },
              {
                key: "friendly",
                label: "Amicaux",
                present: friendly.present,
                total: friendly.total,
                icon: <Handshake className="h-3.5 w-3.5" />,
                toneClassName: "bg-blue-50 text-blue-600",
              },
              {
                key: "tournament",
                label: "Tournois",
                present: tournament.present,
                total: tournament.total,
                icon: <Sparkles className="h-3.5 w-3.5" />,
                toneClassName: "bg-ubac-yellow/20 text-ubac-yellow-dark",
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}
