-- Retour de Cindy du 10/09 (suite) : un besoin d'organisation doit pouvoir
-- concerner PLUSIEURS commissions à la fois (ex. table de marque : Coachs
-- ET Team Communication), pas une seule -- remplace la colonne FK unique
-- posée dans 20261101020000_commission_access.sql par un tableau, même
-- principe que events.target_team_ids déjà utilisé dans cette base.
-- Aucune ligne n'utilisait encore commission_group_id (vérifié : 0 besoin
-- créé avec ce champ depuis son ajout), migration sans perte possible.
alter table public.event_volunteer_needs
  drop column if exists commission_group_id;
alter table public.event_volunteer_needs
  add column if not exists commission_group_ids uuid[] not null default '{}';
