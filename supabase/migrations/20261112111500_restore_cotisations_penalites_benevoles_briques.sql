-- Correctif immédiat : la migration précédente (20261112110000,
-- simplify_access_briques_catalog) retirait 'cotisations'/'penalites'/
-- 'benevoles' du CHECK -- découverte après coup (admin-view.tsx,
-- REQUIRED_BRIQUE) que ces 3 clés servent AUSSI à autoriser un "Comité
-- directeur" restreint à voir les VRAIS écrans Bureau (Cotisations,
-- Pénalités, Accès Commissions & Administration eux-mêmes -- pas leur
-- version publique en lecture seule) -- un sujet différent de la
-- simplification du menu public demandée par Cindy le 12/09. On les
-- restaure ici en attendant sa décision, et on réattribue à Fabrice
-- Gosserez la ligne 'benevoles' supprimée par erreur par la migration
-- précédente (elle lui donnait accès à cet écran Bureau réel).
alter table public.access_profile_briques drop constraint access_profile_briques_brique_check;
alter table public.access_profile_briques add constraint access_profile_briques_brique_check
  check (brique = any (array[
    'calendrier', 'tableau_de_bord', 'membres', 'equipes', 'evenements', 'matchs_resultats',
    'cotisations', 'penalites', 'sponsors', 'benevoles', 'whatsapp_groups',
    'charte_joueur', 'charte_parent', 'reglement_interieur',
    'compte_rendu_bureau', 'compte_rendu_mairies', 'compte_rendu_coachs', 'compte_rendu_cd17_ligue'
  ]));

insert into public.access_profile_briques (profile_id, brique)
values ('5f52fd81-8e01-43eb-b1d1-381c0dba6452', 'benevoles')
on conflict do nothing;
