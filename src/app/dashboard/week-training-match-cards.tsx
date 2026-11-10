"use client";

import { Dumbbell, Trophy } from "lucide-react";
import { isMatchType } from "./event-style";
import { DayEventCard, getCurrentWeekRange, type WeekStripEvent } from "./week-strip-banner";

// Retour du Bureau (09/11, relayé par Cindy, point 5 du plan Tableau de
// bord) : deux cartes distinctes -- "Entraînement(s) de la semaine" et
// "Match(s) de la semaine" -- plutôt que l'ancien repli "événements du jour
// le plus proche" (qui mélangeait les types et ignorait tout ce qui tombait
// un autre jour de la même semaine). Côté Cindy : "une carte entraînement
// de la semaine, une carte matchs de la semaine -- entraînement sur deux
// jours puisque deux entraînements par semaine pour tous il me semble" --
// donc PLUSIEURS cartes possibles par section (pas une seule tronquée),
// jamais limité à "le prochain".
//
// Réutilise DayEventCard tel quel (même carte que le bandeau "Cette
// semaine" et l'ancien résumé du Tableau de bord) -- aucune nouvelle brique
// d'affichage, seulement un nouveau découpage des événements déjà reçus.
// `events` est le même tableau déjà calculé pour le bandeau hebdo
// (headerWeekEvents, voir page.tsx/child-dashboard.tsx) : aucune requête de
// plus.
//
// Coach/Famille/Enfant uniquement (jamais le Bureau, club entier -- voir le
// plan validé avec Cindy : "pas de cartes entraînement/match de la semaine
// ... trop large à l'échelle du club entier").
export default function WeekTrainingMatchCards({ events }: { events: WeekStripEvent[] }) {
  const { weekStart, weekEnd } = getCurrentWeekRange();
  const inWeek = events
    .filter((e) => {
      const t = new Date(e.startTime);
      return t >= weekStart && t < weekEnd;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const trainings = inWeek.filter((e) => e.eventType === "TRAINING");
  const matches = inWeek.filter((e) => isMatchType(e.eventType));

  if (trainings.length === 0 && matches.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {trainings.length > 0 && (
        <div className="flex flex-col gap-2">
          {/* Retour de Cindy du 09/11 ("coloré vert pour les entraînements
              et bleu pour les matchs"), précisé aussitôt après ("texte en
              noir... comme Classement, juste icône coloré") : seule l'icône
              porte la couleur de type (styleFor, event-style.ts --
              court-green entraînement, navy match officiel), le texte reste
              zinc-900 comme le titre "Classement" (ffbb-ranking-table.tsx)
              juste au-dessus dans la même carte. */}
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-900">
            <Dumbbell className="h-3.5 w-3.5 shrink-0 text-court-green" />
            Entraînement{trainings.length > 1 ? "s" : ""} de la semaine
          </p>
          <div className="flex flex-col gap-2">
            {trainings.map((e) => (
              <DayEventCard key={e.id} event={e} showDate />
            ))}
          </div>
        </div>
      )}
      {matches.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-900">
            <Trophy className="h-3.5 w-3.5 shrink-0 text-navy" />
            Match{matches.length > 1 ? "s" : ""} de la semaine
          </p>
          <div className="flex flex-col gap-2">
            {matches.map((e) => (
              <DayEventCard key={e.id} event={e} showDate />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
