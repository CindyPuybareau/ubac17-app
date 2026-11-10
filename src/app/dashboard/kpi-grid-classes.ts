// Retour de Cindy du 10/11 ("Boutique/Sponsors/diaporama même taille que
// les KPI, sur tous les espaces") : mêmes points de rupture EXACTS que
// BureauKpiGrid (bureau-dashboard.tsx) -- réservée à BureauKpiGrid
// lui-même désormais (6 vraies KPI remplissent réellement les 6
// colonnes à partir de lg). Ne plus réutiliser ailleurs : voir
// ACTION_CARDS_GRID_CLASSES/HIGHLIGHTS_GRID_CLASSES ci-dessous.
export const KPI_GRID_CLASSES = "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6";

// Retour de Cindy du 11/11 ("sur pc c'est moche au niveau responsive") :
// la rangée Boutique/Exclu sponsor réutilisait KPI_GRID_CLASSES
// (grid-cols-2/3/6) pour "même taille que les KPI" -- mais cette rangée
// ne contient JAMAIS plus de 2 cartes (Boutique + Exclu sponsor), jamais
// 3 ni 6 : sur grand écran, les colonnes 3 à 6 restaient vides,
// laissant un vide béant à droite des deux cartes réelles. Corrigé en
// fixant 2 colonnes UNE FOIS POUR TOUTES (reflète le nombre réel de
// cartes) avec une largeur maximale (max-w-md) pour éviter l'inverse --
// des cartes démesurées sur un très grand écran. Les cartes ne
// correspondent donc plus exactement en pixels aux KPI à partir de
// sm/lg (elles sont un peu plus larges), compromis assumé : mieux vaut
// deux cartes bien proportionnées qu'un vide à moitié vide qui ressemble
// à un bug.
export const ACTION_CARDS_GRID_CLASSES = "grid max-w-md grid-cols-2 gap-3";

// Retour de Cindy du 11/11 ("un peu de marge entre les deux affiches",
// puis "sur pc c'est moche au niveau responsive") : même logique que
// ACTION_CARDS_GRID_CLASSES ci-dessus -- le diaporama montre toujours
// exactement 1 ou 2 affiches (jamais plus, voir VISIBLE_COUNT dans
// featured-highlights-card.tsx), donc 2 colonnes fixes plutôt que
// 2/3/6 qui laissait 4 colonnes vides sur grand écran. max-w-lg (un peu
// plus large que les cartes d'action ci-dessus : des affiches, pas de
// simples boutons) plutôt qu'une largeur fixe par carte, pour que le
// gap-4 (marge demandée) ne pousse pas la rangée plus large que prévu.
export const HIGHLIGHTS_GRID_CLASSES = "grid max-w-lg grid-cols-2 gap-4";
