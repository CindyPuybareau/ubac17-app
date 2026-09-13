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
// Pénalités restent dans la liste malgré sa demande initiale de les
// retirer : ces 2 clés servent AUSSI, via REQUIRED_BRIQUE (admin-view.tsx),
// à autoriser un "Comité directeur" restreint à voir les VRAIS écrans
// Bureau (Cotisations, Pénalités) -- les retirer casserait cette
// capacité-là, un sujet entièrement différent de la simplification du menu
// PUBLIC en lecture seule qu'elle demandait. Elles restent de toute façon
// sans aucun effet pour une commission/un bénévole en lecture seule :
// buildProfileSections (profile-sections.tsx) n'a jamais construit la
// moindre section pour elles, cocher "Cotisations" pour une commission n'y
// change donc rien -- exactement le même comportement (nul) qu'avant cette
// liste, juste sans perdre la capacité côté Bureau.
//
// Retour de Cindy du 13/09 ("à quoi sert la case Bénévoles ?", puis
// "retire-la aussi de la fiche bénévole") : "Bénévoles" n'a jamais eu le
// moindre effet nulle part -- ni en lecture seule (buildProfileSections ne
// l'a jamais consommée, que ce soit pour une commission ou un bénévole
// individuel), ni ailleurs, SAUF pour le Comité directeur où c'était en
// réalité l'interrupteur de l'écran Bureau "Accès Commissions &
// Administration" (REQUIRED_BRIQUE, admin-view.tsx) sous un nom qui ne
// disait pas du tout ce qu'il faisait. Retirée entièrement de la liste
// ci-dessous (donc de commissions-manager.tsx ET benevoles-manager.tsx, les
// deux seuls autres écrans à la partager) ; COMMITTEE_BRIQUE_GROUPS plus
// bas lui redonne sa vraie brique, sous son vrai nom, "commissions_admin" --
// même interrupteur, même effet, juste honnête sur ce qu'il fait. Les
// anciennes lignes "benevoles" en base (un bénévole, une commission) ont été
// supprimées par la même migration -- elles n'avaient jamais rien changé à
// l'affichage, rien à préserver contrairement au profil Comité directeur.
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

// Fiche d'un membre du Comité directeur (member-detail-modal.tsx) : seul
// écran où "commissions_admin" a un sens -- ajoutée à "Vie du club" plutôt
// que d'exister dans BRIQUE_GROUPS lui-même, pour ne jamais apparaître sur
// une fiche de commission ou de bénévole individuel (voir le commentaire du
// 13/09 plus haut). Donne accès à l'écran Bureau "Accès Commissions &
// Administration" (REQUIRED_BRIQUE, admin-view.tsx).
export const COMMITTEE_BRIQUE_GROUPS = BRIQUE_GROUPS.map((group) =>
  group.label === "Vie du club"
    ? {
        ...group,
        briques: [
          ...group.briques,
          { key: "commissions_admin", label: "Accès Commissions & Administration" },
        ],
      }
    : group
);

export const ALL_BRIQUE_KEYS = BRIQUE_GROUPS.flatMap((g) => g.briques.map((b) => b.key));

export function briqueLabel(key: string): string {
  return ALL_BRIQUE_KEYS.includes(key)
    ? (BRIQUE_GROUPS.flatMap((g) => g.briques).find((b) => b.key === key)?.label ?? key)
    : key;
}
