// Retour de Cindy du 10/11 ("Boutique/Sponsors/diaporama même taille que
// les KPI, sur tous les espaces") : mêmes points de rupture EXACTS que
// BureauKpiGrid (bureau-dashboard.tsx) -- réservée à BureauKpiGrid
// lui-même désormais (6 vraies KPI remplissent réellement les 6
// colonnes à partir de lg). Ne plus réutiliser ailleurs : voir
// DASHBOARD_CARD_WIDTH_CLASSES ci-dessous.
export const KPI_GRID_CLASSES = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6";

// Largeur de chaque affiche du diaporama (featured-highlights-card.tsx,
// SingleHighlightCard) -- inchangée par le retour de Cindy du 11/11
// ci-dessous (elle ne portait que sur Boutique/Exclu sponsor).
export const DASHBOARD_CARD_WIDTH_CLASSES = "w-32 shrink-0 sm:w-40 lg:w-44";

// Retour de Cindy du 11/11 ("les cartes boutique et exclu sponsor même
// taille que les diapo sur PC et tablette", PUIS "non sur téléphone on
// laisse comme avant !") : la correspondance de taille avec le diaporama
// ne s'applique qu'À PARTIR de sm -- sur téléphone, Boutique/Exclu
// sponsor retrouvent leur ancien comportement (grille 2 colonnes,
// chaque carte occupe sa cellule, comme avant ce changement). D'où le
// changement de `display` lui-même au point de rupture (grid -> flex) :
// à partir de sm, la rangée devient un simple flex pour accueillir des
// largeurs FIXES par carte (voir ACTION_CARD_ITEM_CLASSES ci-dessous),
// identiques à celles du diaporama juste à côté.
export const ACTION_CARDS_GRID_CLASSES = "grid w-full grid-cols-2 gap-3 sm:w-auto sm:flex";

// Enveloppe chaque carte (Boutique, Exclu sponsor) à l'intérieur de la
// rangée ci-dessus -- aucune largeur sur téléphone (la grille 2 colonnes
// du parent dicte déjà la taille, comme avant), largeur FIXE identique
// au diaporama à partir de sm (DASHBOARD_CARD_WIDTH_CLASSES ci-dessus,
// mêmes valeurs sm:/lg: -- mobile exclu ici puisque le parent n'est pas
// encore un flex à ce palier).
export const ACTION_CARD_ITEM_CLASSES = "sm:w-40 sm:shrink-0 lg:w-44";

// Diaporama : simple flex, chaque affiche (SingleHighlightCard) porte
// directement DASHBOARD_CARD_WIDTH_CLASSES (w-32 dès le téléphone,
// jamais concerné par le "comme avant" ci-dessus -- sa taille mobile
// n'a jamais été remise en cause).
export const HIGHLIGHTS_GRID_CLASSES = "flex gap-4";
