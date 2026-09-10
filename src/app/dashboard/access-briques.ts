// Liste blanche des briques disponibles pour un profil d'accès sur-mesure
// — doit rester en miroir exact du CHECK de la table access_profile_briques
// (migrations 20261031130000/20261031140000/20261031170000). Paiements
// (au sens : y donner accès sans restriction) et "attribuer un accès" n'y
// figurent jamais, par choix : impossible de les cocher pour un profil
// sur-mesure, quoi qu'il arrive. Extrait dans son propre module (retour de
// Cindy du 05/09) : member-detail-modal.tsx (rôle "Comité directeur") et
// benevoles-manager.tsx en ont besoin à l'identique, chacun cochant ces
// briques directement sur sa propre fiche -- il n'existe plus d'écran
// séparé de catalogue de profils (fusionné, "tout ça réuni").
//
// Regroupement (retour de Cindy du 06/09, "proposer le menu comme le
// bureau est présenté, avec les sous-menus") : mêmes intitulés de groupe
// que le vrai menu Bureau (admin-view.tsx) plutôt que "Général"/"Comptes
// rendus" génériques -- pour qu'on reconnaisse tout de suite à quoi va
// ressembler l'espace une fois les cases cochées. "Documents" ici
// correspond à l'unique onglet "Documents" que verra la personne
// (comptes rendus + Règlement intérieur sur la même page, voir
// profile-sections.tsx / admin-view.tsx).
export const BRIQUE_GROUPS: { label: string; briques: { key: string; label: string }[] }[] = [
  {
    label: "Calendrier",
    briques: [{ key: "calendrier", label: "Calendrier" }],
  },
  {
    // Retour de Cindy du 10/09 : reflète le nouvel onglet "Tableau de
    // bord" du menu Bureau (admin-view.tsx), juste après "Calendrier" --
    // vide pour l'instant côté Bureau, mais déjà cochable pour préparer le
    // terrain. Voir la migration 20261101060000 pour le CHECK élargi.
    label: "Tableau de bord",
    briques: [{ key: "tableau_de_bord", label: "Tableau de bord" }],
  },
  {
    label: "Membres",
    briques: [{ key: "membres", label: "Membres" }],
  },
  {
    label: "Équipes",
    briques: [{ key: "equipes", label: "Équipes" }],
  },
  // Retour de Cindy du 10/09 (fusion Calendrier/Événements) : le groupe
  // "Événements" qui vivait ici est retiré -- la brique "evenements"
  // reste reconnue en interne (aucun profil déjà créé n'est invalidé,
  // voir admin-view.tsx/read-only-briques-data.ts) mais n'est plus
  // proposée comme un nouveau choix séparé, "calendrier" couvrant
  // désormais le même onglet fusionné.
  {
    label: "Matchs & Résultats",
    briques: [{ key: "matchs_resultats", label: "Matchs & Résultats" }],
  },
  {
    label: "Paiements",
    briques: [
      { key: "cotisations", label: "Cotisations" },
      { key: "penalites", label: "Pénalités" },
    ],
  },
  {
    label: "Vie du club",
    briques: [
      { key: "sponsors", label: "Sponsors" },
      { key: "benevoles", label: "Bénévoles" },
    ],
  },
  {
    label: "Documents",
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
