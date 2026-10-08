-- Retour de l'audit de performance du 05/10 : 5 tables publiées pour le
-- temps réel (supabase_realtime) mais jamais écoutées côté appli --
-- WATCHED_TABLES (src/app/dashboard/realtime-sync.tsx) ne les contient
-- pas, et c'est le SEUL endroit de toute l'appli qui ouvre un canal
-- realtime (supabase.channel(...)). Chaque écriture sur ces tables
-- obligeait quand même Supabase à décoder le changement pour la
-- réplication (realtime.list_changes, vu à plusieurs reprises à
-- 10-52 secondes dans les logs) -- travail perdu, personne n'écoutait.
alter publication supabase_realtime drop table access_profiles;
alter publication supabase_realtime drop table access_profile_briques;
alter publication supabase_realtime drop table benevoles;
alter publication supabase_realtime drop table event_benevole_invites;
alter publication supabase_realtime drop table event_role_types;
