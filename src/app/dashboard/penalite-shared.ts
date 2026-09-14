// Extrait de penalites-manager.tsx (retour de Cindy du 14/09, "Payé par le
// club" en plus de "Payé par le joueur") : penalites-card.tsx (réutilisé par
// l'Espace Enfant, un composant serveur) ne doit jamais importer depuis un
// fichier "use client" -- même principe que cotisation-shared.ts pour les
// cotisations.
export type PenaliteStatut = "EN_ATTENTE" | "PAYE" | "PAYE_CLUB";

export function isPaidStatut(statut: string | null): boolean {
  return statut === "PAYE" || statut === "PAYE_CLUB";
}
