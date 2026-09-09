// Boutique en ligne du club (espace-des-marques-clubs.com), ajoutée au menu
// de tous les espaces sauf celui des enfants (demande de Cindy du
// 2026-08-21). Un seul endroit pour l'URL : partagée par admin-view.tsx,
// coach-view.tsx et family-view.tsx, jamais dupliquée.
export const BOUTIQUE_URL =
  "https://www.espace-des-marques-clubs.com/194-union-basket-angoulins-chatelaillon";

// Retour de Cindy du 09/09 : la vitrine publique ci-dessus (BOUTIQUE_URL)
// n'a rien à voir avec l'espace commerçant du même site -- un vrai compte
// (identifiant + mot de passe personnels de Cindy), où se consultent les
// ventes/commissions rapportées par la boutique. Reste un simple lien
// externe comme BOUTIQUE_URL (l'appli ne voit ni ne stocke jamais ce mot
// de passe, chacun se connecte avec son propre compte) -- seulement
// ajouté à l'Espace Bureau (admin-view.tsx), jamais Coach/Famille : une
// donnée financière du club, pas la leur.
export const BOUTIQUE_SALES_URL = "https://www.espace-des-marques-clubs.com/";
