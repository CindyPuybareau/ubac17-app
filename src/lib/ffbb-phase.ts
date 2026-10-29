// Retour de Cindy du 29/10 ("je veux du propre") : la convention "NULL
// veut dire phase 1" (ffbb_phase n'existait pas avant le chantier phase
// 1 -> phase 2, voir la migration ffbb_phase2 -- toutes les lignes
// antérieures sont restées NULL) était réécrite sous une forme légèrement
// différente à chaque endroit qui la lisait (`?? 1` ici, un filtre SQL
// `.or(...is.null)` là, une comparaison nue `=== 2` ailleurs) -- un seul
// point d'entrée ici, réutilisé partout (route API, synchro, Tableau de
// bord, calendrier) pour que la règle ne puisse plus être oubliée à un
// endroit si elle change un jour.
export const FFBB_PHASE_1 = 1;
export const FFBB_PHASE_2 = 2;
export type FfbbPhase = typeof FFBB_PHASE_1 | typeof FFBB_PHASE_2;

export function normalizeFfbbPhase(phase: number | null | undefined): FfbbPhase {
  return phase === FFBB_PHASE_2 ? FFBB_PHASE_2 : FFBB_PHASE_1;
}

// Équivalent du "NULL = phase 1" ci-dessus, mais en filtre PostgREST --
// pour une requête DB directe (team_rankings, events), qui ne peut pas
// appeler normalizeFfbbPhase (fonction JS, pas SQL).
export const FFBB_PHASE_1_OR_NULL_FILTER = "ffbb_phase.eq.1,ffbb_phase.is.null";
