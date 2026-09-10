-- Retour de Cindy du 10/09 ("créer le même que le bureau avec les cases à
-- cocher") : ajoute "tableau_de_bord" à la liste blanche des briques
-- cochables pour un profil d'accès sur-mesure (Comité directeur, Accès
-- Commissions & Administration, Bénévoles & Accès) -- reflète le nouvel
-- onglet "Tableau de bord" du menu Bureau (admin-view.tsx), second onglet
-- juste après "Calendrier". "evenements" reste dans la liste blanche : la
-- brique n'est plus proposée dans l'écran de réglage (fusionnée dans
-- "calendrier", voir access-briques.ts) mais aucun profil déjà créé avec
-- cette brique ne doit être invalidé.
alter table public.access_profile_briques
  drop constraint if exists access_profile_briques_brique_check;

alter table public.access_profile_briques
  add constraint access_profile_briques_brique_check
  check (brique in (
    'calendrier',
    'tableau_de_bord',
    'membres',
    'equipes',
    'evenements',
    'matchs_resultats',
    'cotisations',
    'sponsors',
    'benevoles',
    'penalites',
    'compte_rendu_bureau',
    'compte_rendu_mairies',
    'compte_rendu_coachs'
  ));
