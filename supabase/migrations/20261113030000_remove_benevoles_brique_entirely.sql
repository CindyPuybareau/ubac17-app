-- Retour de Cindy du 13/09 ("retire-la aussi de la fiche bénévole") : suite
-- de 20261113020000_split_commissions_admin_brique.sql -- "benevoles" n'a
-- plus aucun consommateur (ni commission, ni bénévole individuel, ni Comité
-- directeur, déjà basculé vers "commissions_admin" par la migration
-- précédente). Les 2 lignes restantes (un bénévole, une commission) n'ont
-- jamais rien changé à l'affichage : rien à préserver, contrairement au
-- profil Comité directeur.

delete from public.access_profile_briques where brique = 'benevoles';

alter table public.access_profile_briques
  drop constraint access_profile_briques_brique_check;

alter table public.access_profile_briques
  add constraint access_profile_briques_brique_check
  check (brique = any (array[
    'calendrier', 'tableau_de_bord', 'membres', 'equipes', 'evenements',
    'matchs_resultats', 'cotisations', 'penalites', 'sponsors',
    'commissions_admin', 'whatsapp_groups', 'charte_joueur', 'charte_parent',
    'reglement_interieur', 'compte_rendu_bureau', 'compte_rendu_mairies',
    'compte_rendu_coachs', 'compte_rendu_cd17_ligue'
  ]));
