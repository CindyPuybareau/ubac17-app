// Boutons d'action des cartes de match (retour de Cindy du 12/11, "même
// effet et même visuel que Ajouter le code e-Marque") : un seul gabarit
// pour Score, e-Marque et Feuilles de match -- contour en pointillés de la
// couleur de l'action, léger fond coloré au survol/à l'appui. Hauteur
// ~26px (py-1) : assez pour le pouce sur téléphone, libellés courts pour
// que les trois tiennent sur une ligne.
export const ACTION_CHIP_BASE =
  "inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border border-dashed px-2.5 py-1 text-[11px] font-semibold transition-colors";

export const ACTION_CHIP_COLORS = {
  blue: "border-ubac-blue/40 text-ubac-blue hover:border-ubac-blue hover:bg-ubac-blue/10 active:bg-ubac-blue/15",
  yellow:
    "border-ubac-yellow-dark/50 text-ubac-yellow-dark hover:border-ubac-yellow-dark hover:bg-ubac-yellow/10 active:bg-ubac-yellow/20",
  green: "border-court-green/40 text-court-green hover:border-court-green hover:bg-court-green/10 active:bg-court-green/15",
} as const;
