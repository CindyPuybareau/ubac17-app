-- Retour de Cindy du 12/09 : nouvelle liste de briques cochables pour
-- Commissions & Administration (et bénévoles individuels, même catalogue
-- partagé) -- Cotisations/Pénalités/Bénévoles retirées (jamais
-- implémentées côté lecture seule de toute façon, voir buildProfileSections),
-- Documents éclaté en briques individuelles (une par charte/compte rendu,
-- au lieu d'un seul bloc à 3 briques), Tableau de bord (déjà dans la liste)
-- et un nouveau "Groupes WhatsApp" (annuaire en lecture seule).
delete from public.access_profile_briques where brique in ('cotisations', 'penalites', 'benevoles');

alter table public.access_profile_briques drop constraint access_profile_briques_brique_check;
alter table public.access_profile_briques add constraint access_profile_briques_brique_check
  check (brique = any (array[
    'calendrier', 'tableau_de_bord', 'membres', 'equipes', 'evenements', 'matchs_resultats',
    'sponsors', 'whatsapp_groups',
    'charte_joueur', 'charte_parent', 'reglement_interieur',
    'compte_rendu_bureau', 'compte_rendu_mairies', 'compte_rendu_coachs', 'compte_rendu_cd17_ligue'
  ]));

comment on constraint access_profile_briques_brique_check on public.access_profile_briques is
  'Miroir exact de access-briques.ts (BRIQUE_GROUPS) -- retour de Cindy du 12/09.';
