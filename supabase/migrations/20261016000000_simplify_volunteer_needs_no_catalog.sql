-- SIMPLIFICATION DE LA GESTION DES RÔLES D'ORGANISATION (inspiration
-- SportEasy, retour de Cindy du 2026-08-19) : le système de besoins en
-- bénévoles (event_volunteer_needs) n'a plus besoin du catalogue partagé
-- event_role_types — la liste de rôles standard (Buvette, Table de
-- marque, Arbitrage, Installation/Rangement, Lavage maillots, Autre) est
-- désormais fixe côté code, plus simple qu'une matrice éditable en base.
-- L'ancien système (event_tasks, maillots/goûter géré par le coach côté
-- match) reste inchangé et continue d'utiliser event_role_types tel quel.

-- Le rôle n'est plus garanti par une clé étrangère vers event_role_types
-- (retiré : la liste valide est désormais fixe côté application) — un
-- champ libre accompagne le code 'AUTRE' pour un besoin non standard.
alter table public.event_volunteer_needs
  drop constraint if exists event_volunteer_needs_role_code_fkey;

alter table public.event_volunteer_needs
  add column if not exists custom_label text;

-- Les 3 rôles ajoutés dans ce chantier pour l'ancien catalogue partagé
-- (Buvette, Arbitrage, Installation) n'ont plus lieu d'y figurer — sans
-- ce nettoyage, ils réapparaîtraient dans l'ancien sélecteur "Organisation
-- Parents" (maillots/goûter), exactement le bug remonté par Cindy plus tôt
-- dans ce même chantier. "Table de marque" existait déjà avant ce
-- chantier (pas ajouté par nous) : laissé intact.
delete from public.event_role_types where code in ('BUVETTE', 'ARBITRAGE', 'INSTALLATION');
