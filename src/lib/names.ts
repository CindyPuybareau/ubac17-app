// Règle d'affichage des noms, commune à toute l'application : le nom de
// famille en majuscules, le prénom avec une majuscule initiale seulement.
// C'est déjà la convention du tableau Membres du Bureau ; la centraliser
// ici évite que chaque écran la réinvente — c'est ainsi qu'un "Lamouret"
// en minuscules se retrouvait à côté d'un "DEVILLERS" dans la même
// colonne, ou qu'un "DAMIEN" saisi tout en majuscules dans le fichier
// d'inscription ressortait tel quel dans toute l'appli.
//
// Seule la casse est traitée ici. La graisse (font-semibold sur le nom,
// rien sur le prénom) relève du rendu et reste dans les composants.

export function formatLastName(last: string | null | undefined) {
  return (last ?? "").trim().toUpperCase();
}

// Pour comparer/dédupliquer des noms, jamais pour l'affichage (audit du
// 31/08, bug remonté par Cindy : "Leonore"/"Léonore" traités comme deux
// personnes différentes lors d'un import — l'accent seul suffisait à
// casser la correspondance). Retire les accents en plus de la casse/des
// espaces, pour que "Léonore" et "Leonore" (accent oublié/perdu à la
// saisie ou à l'export) soient reconnus comme le même nom.
export function normalizeNameForMatching(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Majuscule en tête de chaque partie, reste en minuscules — traite les
// prénoms composés (espace ou tiret : "Jean-Pierre", "Marie Claire") et les
// apostrophes ("N'Guyen") comme autant de limites de mot, quelle que soit
// la casse saisie au départ (tout majuscules, tout minuscules, mélangée).
function capitalizeWord(word: string): string {
  if (!word) return word;
  return word.charAt(0).toLocaleUpperCase("fr-FR") + word.slice(1).toLocaleLowerCase("fr-FR");
}

export function formatFirstName(first: string | null | undefined) {
  const trimmed = (first ?? "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/(\s+|-|['’])/)
    // Apostrophe droite (') ET typographique ('), la seconde étant celle
    // que l'autocorrection iOS/Word insère par défaut ("n'guyen" tapé sur
    // iPhone devient "n’guyen") — sans les deux formes ici, ces prénoms
    // n'étaient jamais coupés au bon endroit et ressortaient "N’guyen" au
    // lieu de "N’Guyen".
    .map((part) => (/^(\s+|-|['’])$/.test(part) ? part : capitalizeWord(part)))
    .join("");
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

// Tri par nom de famille, appliqué de la même façon partout dans l'appli
// (tableau Membres, listes d'équipe, trombinoscope, groupes WhatsApp...) —
// un seul point pour cette règle plutôt qu'un localeCompare("fr")
// réinventé (ou oublié) dans chaque écran qui liste des personnes. Ne
// mute jamais le tableau reçu.
export function sortByLastName<T>(
  items: T[],
  getLastName: (item: T) => string | null | undefined
): T[] {
  return [...items].sort((a, b) =>
    formatLastName(getLastName(a)).localeCompare(formatLastName(getLastName(b)), "fr")
  );
}
