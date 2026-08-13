// Règle d'affichage des noms, commune à toute l'application : le nom de
// famille en majuscules, le prénom en casse normale. C'est déjà la
// convention du tableau Membres du Bureau ; la centraliser ici évite que
// chaque écran la réinvente — c'est ainsi qu'un "Lamouret" en minuscules
// se retrouvait à côté d'un "DEVILLERS" dans la même colonne.
//
// Seule la casse est traitée ici. La graisse (font-semibold sur le nom,
// rien sur le prénom) relève du rendu et reste dans les composants.

export function formatLastName(last: string | null | undefined) {
  return (last ?? "").trim().toUpperCase();
}

export function formatFirstName(first: string | null | undefined) {
  return (first ?? "").trim();
}

// "Prénom NOM" — l'ordre de lecture habituel du club, avec le nom mis en
// évidence par sa casse. Le repli sert aux fiches incomplètes plutôt que
// d'afficher une chaîne vide.
export function formatPersonName(
  first: string | null | undefined,
  last: string | null | undefined,
  fallback = "Sans nom"
) {
  return [formatFirstName(first), formatLastName(last)].filter(Boolean).join(" ") || fallback;
}
