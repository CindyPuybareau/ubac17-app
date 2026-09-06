-- Retour de Cindy du 05/09 (juste après l'étape 2, en regardant l'écran en
-- local) : "Événements" et "Matchs & Résultats" manquaient dans la liste
-- des briques disponibles pour un profil sur-mesure. Ajout des deux au
-- CHECK de access_profile_briques -- aucune brique existante n'est
-- retirée, aucun profil déjà créé n'est modifié.
alter table public.access_profile_briques
  drop constraint if exists access_profile_briques_brique_check;

alter table public.access_profile_briques
  add constraint access_profile_briques_brique_check
  check (brique in (
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
