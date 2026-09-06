-- Retour de Cindy du 06/09 ("ajouter le calendrier aussi, il est
-- important") : la brique "calendrier" correspond à l'onglet "Calendrier"
-- du Bureau (le résumé + calendrier complet, page.tsx/bureau-dashboard.tsx)
-- -- jusqu'ici jamais dans la liste blanche, donc jamais accessible à un
-- profil restreint.
alter table public.access_profile_briques
  drop constraint if exists access_profile_briques_brique_check;

alter table public.access_profile_briques
  add constraint access_profile_briques_brique_check
  check (brique in (
    'calendrier',
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
