// Liste blanche des briques pouvant être accordées à un membre du Comité
// directeur avec un accès Bureau restreint (member-detail-modal.tsx) --
// doit rester en miroir exact du CHECK de la table access_profile_briques
// (migrations 20261112110000/20261112111500).
//
// Nettoyage du 21/10 ("Accès Commissions & Administration" et l'accès
// individuel bénévole retirés entièrement) : ce fichier servait jusqu'ici
// aussi aux commissions et aux bénévoles individuels (lecture seule) --
// toute cette partie a disparu avec la fonctionnalité. Seul reste l'usage
// originel : donner à un Comité directeur restreint accès à de vrais
// écrans Bureau (Cotisations/Pénalités/Documents...), via REQUIRED_BRIQUE
// (admin-view.tsx).
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
    briques: [{ key: "sponsors", label: "Sponsors" }],
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
