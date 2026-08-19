-- BUVETTE/ARBITRAGE/INSTALLATION avaient event_types = '{}' ("tous les
-- types") — pensé uniquement pour le nouveau VolunteerNeedsPanel (qui ne
-- filtre jamais par type d'événement), sans réaliser que le même
-- catalogue alimente aussi l'ancien bloc "Organisation Parents"
-- (MatchTasksPanel, maillots/goûter) via rolesForEventType(). Résultat :
-- ces 3 rôles apparaissaient aussi sur les entraînements dans CE bloc-là,
-- alors qu'un entraînement n'a jamais besoin d'organisation (déjà vu avec
-- Cindy, capture d'écran du 2026-08-19 montrant "Installation / Rangement"
-- sur un entraînement U13F).
update public.event_role_types
set event_types = array['MATCH', 'FRIENDLY', 'TOURNAMENT', 'OTHER']
where code in ('BUVETTE', 'ARBITRAGE', 'INSTALLATION');
