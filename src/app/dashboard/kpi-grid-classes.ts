// Mêmes points de rupture que BureauKpiGrid (bureau-dashboard.tsx) --
// réservée à BureauKpiGrid lui-même (6 vraies KPI remplissent réellement
// les 6 colonnes à partir de lg).
export const KPI_GRID_CLASSES = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6";

// Retour de Cindy du 11/11 (plusieurs allers-retours sur cette rangée) :
// disposition retenue --
// - Sur téléphone : Boutique + Exclu sponsor CÔTE À CÔTE en pleine
//   largeur (comme BureauKpiGrid), diaporama EN DESSOUS dans sa propre
//   rangée pleine largeur -- deux blocs indépendants, cachés à partir de
//   sm (MOBILE_ACTION_ROW_CLASSES / MOBILE_HIGHLIGHTS_WRAPPER_CLASSES).
// - À partir de sm (tablette/PC) : Boutique/Exclu sponsor EMPILÉS (l'un
//   sous l'autre) dans UNE SEULE cellule, large comme UNE SEULE carte
//   KPI ("même taille que les KPI... en largeur") ; le diaporama occupe
//   le RESTE de la rangée (DESKTOP_HIGHLIGHTS_SPAN_CLASSES), pour ne
//   jamais laisser de grand vide à droite de l'écran.
//
// Même grille EXACTE que KPI_GRID_CLASSES (sm:grid-cols-3 lg:grid-cols-6)
// pour que la première cellule (Boutique/Exclu sponsor empilés) ait
// EXACTEMENT la largeur d'une carte KPI à chaque palier -- le base
// grid-cols-2 est omis ici (ce bloc est caché sur téléphone).
export const DESKTOP_ROW_CLASSES = "hidden gap-4 sm:grid sm:grid-cols-3 lg:grid-cols-6";

// Diaporama à partir de sm : occupe tout le reste de DESKTOP_ROW_CLASSES
// (3 colonnes - 1 pour Boutique/Exclu sponsor = 2 ; 6 colonnes - 1 = 5).
// FeaturedHighlightsCard gère déjà sa propre grille interne (toujours
// w-full, voir featured-highlights-card.tsx) : elle se redivise
// naturellement sur la largeur réelle de cette cellule, qu'elle soit
// large de 2 ou 5 colonnes.
export const DESKTOP_HIGHLIGHTS_SPAN_CLASSES = "col-span-2 lg:col-span-5";

// Rangées mobile uniquement (cachées à partir de sm, voir
// DESKTOP_ROW_CLASSES ci-dessus).
// Boutique + Exclu sponsor : grid-cols-2 pleine largeur, comme
// BureauKpiGrid à ce palier (ce sont deux cartes simples, pas de
// grille interne propre -- cette grille est portée par l'appelant).
export const MOBILE_ACTION_ROW_CLASSES = "grid grid-cols-2 gap-3 sm:hidden";

// Diaporama : simple enveloppe de visibilité -- FeaturedHighlightsCard
// porte déjà sa propre grille interne pleine largeur (w-full
// grid-cols-2), pas besoin d'une grille supplémentaire ici.
export const MOBILE_HIGHLIGHTS_WRAPPER_CLASSES = "sm:hidden";
