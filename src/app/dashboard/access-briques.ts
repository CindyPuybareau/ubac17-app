// Liste blanche des briques disponibles pour un profil d'accès sur-mesure
// — doit rester en miroir exact du CHECK de la table access_profile_briques
// (migrations 20261112110000/20261112111500). Paiements (au sens : y
// donner accès sans restriction) et "attribuer un accès" n'y figurent
// jamais, par choix : impossible de les cocher pour un profil sur-mesure,
// quoi qu'il arrive. Extrait dans son propre module (retour de Cindy du
// 05/09) : member-detail-modal.tsx (rôle "Comité directeur") et
// benevoles-manager.tsx en ont besoin à l'identique, chacun cochant ces
// briques directement sur sa propre fiche -- il n'existe plus d'écran
// séparé de catalogue de profils (fusionné, "tout ça réuni").
//
// Retour de Cindy du 12/09 ("le menu que l'on doit pouvoir cocher aux
// commissions et administrations") : "Documents" éclaté en une brique par
// document/compte rendu plutôt qu'un seul bloc à 3 briques (pour choisir
// précisément lesquels une commission voit), et un nouveau "Groupes
// WhatsApp" (annuaire en lecture seule des groupes du club). Cotisations/
// Pénalités/Bénévoles restent dans la liste malgré sa demande de les
// retirer : ces 3 clés servent AUSSI, via REQUIRED_BRIQUE (admin-view.tsx),
// à autoriser un "Comité directeur" restreint à voir les VRAIS écrans
// Bureau (Cotisations, Pénalités, Accès Commissions & Administration
// eux-mêmes) -- les retirer casserait cette capacité-là, un sujet
// entièrement différent de la simplification du menu PUBLIC en lecture
// seule qu'elle demandait. Elles restent de toute façon sans aucun effet
// pour une commission/un bénévole en lecture seule : buildProfileSections
// (profile-sections.tsx) n'a jamais construit la moindre section pour
// elles, cocher "Cotisations" pour une commission n'y change donc rien --
// exactement le même comportement (nul) qu'avant cette liste, juste sans
// perdre la capacité côté Bureau. À retirer plus tard si Cindy confirme
// vouloir aussi perdre cette capacité côté Comité directeur.
// Regroupement (retour de Cindy du 06/09, "proposer le menu comme le
// bureau est présenté, avec les sous-menus") : mêmes intitulés de groupe
// que le vrai menu Bureau (admin-view.tsx) plutôt que "Général"/"Comptes
// rendus" génériques -- pour qu'on reconnaisse tout de suite à quoi va
// ressembler l'espace une fois les cases cochées.
export const BRIQUE_GROUPS: { label: string; briques: { key: string; label: string }[] }[] = [
  {
    label: "Calendrier",
    briques: [{ key: "calendrier", label: "Calendrier" }],
  },
  {
    // Retour de Cindy du 12/09 : compteurs simples (membres, équipes,
    // événements à venir, anniversaires de la semaine) côté commission --
    // jamais de donnée financière ni nominative, voir DashboardSection
    // (profile-sections.tsx). Toujours l'onglet réel (KPI complets) côté
    // Bureau, inchangé.
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
      { key: "whatsapp_groups", label: "Groupes WhatsApp" },
    ],
  },
  {
    label: "Documents",
    briques: [
      { key: "charte_joueur", label: "Charte du Joueur" },
      { key: "charte_parent", label: "Charte du Parent" },
      { key: "reglement_interieur", label: "Règlement Intérieur" },
      { key: "compte_rendu_bureau", label: "Compte rendu — Bureau" },
      { key: "compte_rendu_mairies", label: "Compte rendu — Mairies" },
      { key: "compte_rendu_coachs", label: "Compte rendu — Coachs" },
      { key: "compte_rendu_cd17_ligue", label: "Compte rendu — CD17 / Ligue" },
    ],
  },
];

export const ALL_BRIQUE_KEYS = BRIQUE_GROUPS.flatMap((g) => g.briques.map((b) => b.key));

export function briqueLabel(key: string): string {
  return ALL_BRIQUE_KEYS.includes(key)
    ? (BRIQUE_GROUPS.flatMap((g) => g.briques).find((b) => b.key === key)?.label ?? key)
    : key;
}
