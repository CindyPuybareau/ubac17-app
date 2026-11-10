// Retour de Cindy du 10/11 ("Boutique/Sponsors/diaporama même taille que
// les KPI, sur tous les espaces") : mêmes points de rupture EXACTS que
// BureauKpiGrid (bureau-dashboard.tsx) -- une seule constante partagée
// plutôt qu'un même littéral recopié dans boutique-card.tsx,
// featured-highlights-card.tsx et les 4 espaces, qui finirait
// immanquablement par diverger d'un fichier à l'autre. Bureau a de
// vraies KPI au-dessus pour comparer visuellement ; Coach/Famille/Enfant
// n'en ont pas, mais la même grille garantit la même taille de carte
// partout, avec ou sans KPI à côté.
export const KPI_GRID_CLASSES = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6";

// Retour de Cindy du 11/11 ("un peu de marge entre les deux affiches") :
// mêmes points de rupture que KPI_GRID_CLASSES ci-dessus (2/3/6 colonnes,
// mêmes cartes "même taille que les KPI"), juste un gap légèrement plus
// généreux -- deux affiches posters ont besoin de plus respirer qu'une
// rangée de 6 petites cartes KPI. Volontairement une constante séparée
// plutôt qu'une concaténation de classes Tailwind (ex. `${KPI_GRID_CLASSES}
// gap-4`) : deux classes gap-* contradictoires dans une même chaîne ne
// donnent aucune garantie sur laquelle gagne (même spécificité CSS, ordre
// non garanti côté Tailwind) -- une chaîne autonome élimine le risque.
export const HIGHLIGHTS_GRID_CLASSES = "grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6";
