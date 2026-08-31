import { computeAgeBand } from "./season";

// Suggestion automatique d'équipe à l'inscription (31/08). Volontairement
// indépendant de toute source de données précise (fichier Excel,
// formulaire Google...) : ne prend que (date de naissance, sexe, type de
// licence) en entrée, pour rester utilisable aussi bien par l'import
// "Suivi Inscriptions" d'aujourd'hui que par un futur formulaire branché
// directement sur l'appli (retour de Cindy du 31/08 — "demain plus
// personne n'utilisera ce fichier Excel").
//
// Les libellés de droite (Babys, U9 Mixte, Séniors M...) sont ceux
// RÉELLEMENT utilisés dans public.teams chez l'UBAC (vérifiés par requête
// le 31/08) — pas une convention générique. Si le club renomme une équipe
// un jour, cette table doit être mise à jour avec elle.
export type TargetTeamCategory =
  | "Babys"
  | "U9 Mixte"
  | "U11 Mixte"
  | "U13F"
  | "U13M"
  | "U15M"
  | "U18M"
  | "Séniors M"
  | "Loisirs F"
  | "Loisirs Mixtes";

export function suggestTeamCategory({
  birthDate,
  sex,
  licenseType,
  referenceDate,
}: {
  birthDate: string | null;
  sex: string | null;
  licenseType: string | null;
  referenceDate?: Date;
}): TargetTeamCategory | null {
  // Un dirigeant qui ne joue pas ("Dirigeant" seul, sans "Joueur" dans le
  // libellé) n'a besoin d'aucune équipe — retour de Cindy du 31/08.
  const isPlayer = licenseType != null && /joueur/i.test(licenseType);
  if (!isPlayer) return null;

  const isLoisir = licenseType != null && /loisir/i.test(licenseType);
  const isFeminin = sex === "Féminin";
  const isMasculin = sex === "Masculin";

  // Loisir (toujours sénior d'après le fichier du club lui-même — la
  // mention "uniquement pour les séniors" figure dans le libellé de
  // licence) : le sexe suffit, pas besoin de la date de naissance.
  if (isLoisir) {
    if (isFeminin) return "Loisirs F";
    if (isMasculin) return "Loisirs Mixtes";
    return null;
  }

  const ageBand = computeAgeBand(birthDate, referenceDate);
  switch (ageBand) {
    case "U07":
      return "Babys";
    case "U09":
      return "U9 Mixte";
    case "U11":
      return "U11 Mixte";
    case "U13":
      return isFeminin ? "U13F" : isMasculin ? "U13M" : null;
    case "U15":
      // Pas d'équipe U15F chez l'UBAC aujourd'hui — jamais suggéré tant
      // qu'aucune équipe correspondante n'existe réellement.
      return isMasculin ? "U15M" : null;
    case "U18":
      // Pas d'équipe U18F aujourd'hui, même raison.
      return isMasculin ? "U18M" : null;
    case "SENIOR":
      // Pas d'équipe compétition féminine sénior aujourd'hui — et "Séniors
      // 1"/"Séniors 2"/"Séniors M" ne se distinguent pas par l'âge ou le
      // sexe (retour de Cindy du 31/08) : on cible directement l'équipe de
      // base "Séniors M", la répartition fine reste un geste du Bureau/
      // Coach ensuite (comme pour U13M/U18M).
      return isMasculin ? "Séniors M" : null;
    default:
      return null;
  }
}
