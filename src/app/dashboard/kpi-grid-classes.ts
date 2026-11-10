// Retour de Cindy du 10/11 ("Boutique/Sponsors/diaporama même taille que
// les KPI, sur tous les espaces") : mêmes points de rupture EXACTS que
// BureauKpiGrid (bureau-dashboard.tsx) -- réservée à BureauKpiGrid
// lui-même désormais (6 vraies KPI remplissent réellement les 6
// colonnes à partir de lg). Ne plus réutiliser ailleurs : voir
// ACTION_CARD_ITEM_CLASSES ci-dessous.
export const KPI_GRID_CLASSES = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6";

// Retour de Cindy du 11/11 (plusieurs allers-retours : "même taille que
// les diapo sur PC et tablette", "non sur téléphone on laisse comme
// avant", puis "le diaporama... ne prend plus toute la largeur des
// autres cartes en haut et en bas, c'est moche") : sur téléphone,
// Boutique/Exclu sponsor ET le diaporama doivent TOUS LES TROIS garder
// leur ancien comportement (grille 2 colonnes PLEINE LARGEUR, comme
// BureauKpiGrid juste au-dessus) -- jamais de largeur fixe à ce palier,
// sous peine de rangées plus étroites que le reste de la page. À partir
// de sm (tablette/PC), les trois passent à une largeur fixe IDENTIQUE
// (ACTION_CARD_ITEM_CLASSES ci-dessous) pour pouvoir tenir sur une même
// ligne, alignée à gauche.
//
// D'où le changement de `display` au point de rupture (grid -> flex) :
// sur téléphone, grid-cols-2 + w-full réplique exactement BureauKpiGrid ;
// à partir de sm, la rangée devient un simple flex pour accueillir des
// largeurs FIXES par carte.
export const ACTION_CARDS_GRID_CLASSES = "grid w-full grid-cols-2 gap-3 sm:w-auto sm:flex";

// Même principe que ACTION_CARDS_GRID_CLASSES ci-dessus, pour le
// diaporama (featured-highlights-card.tsx) -- gap légèrement plus
// généreux (affiches, pas de simples boutons).
export const HIGHLIGHTS_GRID_CLASSES = "grid w-full grid-cols-2 gap-4 sm:w-auto sm:flex";

// Enveloppe chaque carte (Boutique, Exclu sponsor, chaque affiche du
// diaporama) à l'intérieur des deux rangées ci-dessus -- AUCUNE largeur
// sur téléphone (la grille 2 colonnes du parent dicte déjà la taille,
// comme BureauKpiGrid), largeur FIXE identique pour les trois à partir
// de sm (une seule constante, jamais trois valeurs recopiées qui
// finiraient par diverger).
export const ACTION_CARD_ITEM_CLASSES = "sm:w-40 sm:shrink-0 lg:w-44";
