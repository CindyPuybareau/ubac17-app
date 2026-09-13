-- Retour de Cindy du 13/09 ("à quoi sert la case Bénévoles ?") : la brique
-- "benevoles" n'a jamais eu d'effet en lecture seule (buildProfileSections
-- ne l'a jamais consommée) -- son seul rôle était de donner accès, via
-- REQUIRED_BRIQUE (admin-view.tsx), à l'écran Bureau "Accès Commissions &
-- Administration" pour un "Comité directeur" restreint. Nom trompeur pour
-- ce que ça fait vraiment : scindée en "commissions_admin", cochable
-- uniquement dans COMMITTEE_BRIQUE_GROUPS (access-briques.ts, fiche Comité
-- directeur) -- "benevoles" reste valide pour la fiche d'un bénévole
-- individuel (benevoles-manager.tsx), inchangée, hors du périmètre de
-- cette demande.

alter table public.access_profile_briques
  drop constraint access_profile_briques_brique_check;

alter table public.access_profile_briques
  add constraint access_profile_briques_brique_check
  check (brique = any (array[
    'calendrier', 'tableau_de_bord', 'membres', 'equipes', 'evenements',
    'matchs_resultats', 'cotisations', 'penalites', 'sponsors', 'benevoles',
    'commissions_admin', 'whatsapp_groups', 'charte_joueur', 'charte_parent',
    'reglement_interieur', 'compte_rendu_bureau', 'compte_rendu_mairies',
    'compte_rendu_coachs', 'compte_rendu_cd17_ligue'
  ]));

-- Report automatique : seuls les profils réellement utilisés par un membre
-- du Comité directeur (club_administrators.access_profile_id) sont
-- concernés -- un bénévole individuel ou une commission gardent "benevoles"
-- tel quel (aucun des deux ne l'utilise de toute façon). Vérifié le 13/09 :
-- un seul profil réel concerné (Fabrice Gosserez), jamais partagé avec un
-- bénévole ni une commission.
update public.access_profile_briques
set brique = 'commissions_admin'
where brique = 'benevoles'
  and profile_id in (
    select access_profile_id from public.club_administrators
    where access_profile_id is not null
  );
