// Liste blanche des briques disponibles pour un profil d'accès sur-mesure
// — doit rester en miroir exact du CHECK de la table access_profile_briques
// (migrations 20261031130000/20261031140000). Paiements et "attribuer un
// accès" n'y figurent jamais, par choix : impossible de les cocher pour un
// profil sur-mesure, quoi qu'il arrive. Extrait dans son propre module
// (retour de Cindy du 05/09) : member-detail-modal.tsx (rôle "Comité
// directeur") et benevoles-manager.tsx en ont besoin à l'identique, chacun
// cochant ces briques directement sur sa propre fiche -- il n'existe plus
// d'écran séparé de catalogue de profils (fusionné, "tout ça réuni").
export const BRIQUE_GROUPS: { label: string; briques: { key: string; label: string }[] }[] = [
  {
    label: "Général",
    briques: [
      { key: "calendrier", label: "Calendrier" },
      { key: "membres", label: "Membres" },
      { key: "equipes", label: "Équipes" },
      { key: "evenements", label: "Événements" },
      { key: "matchs_resultats", label: "Matchs & Résultats" },
      { key: "cotisations", label: "Cotisations" },
      { key: "sponsors", label: "Sponsors" },
      { key: "benevoles", label: "Bénévoles" },
      { key: "penalites", label: "Pénalités" },
    ],
  },
  {
    label: "Comptes rendus",
    briques: [
      { key: "compte_rendu_bureau", label: "Compte rendu — Bureau" },
      { key: "compte_rendu_mairies", label: "Compte rendu — Mairies" },
      { key: "compte_rendu_coachs", label: "Compte rendu — Coachs" },
    ],
  },
];

export const ALL_BRIQUE_KEYS = BRIQUE_GROUPS.flatMap((g) => g.briques.map((b) => b.key));

export function briqueLabel(key: string): string {
  return ALL_BRIQUE_KEYS.includes(key)
    ? (BRIQUE_GROUPS.flatMap((g) => g.briques).find((b) => b.key === key)?.label ?? key)
    : key;
}
