-- Correction de 20261021010000 : j'avais archivé JERSEYS/SNACKS/
-- TABLE_MARQUE en pensant que c'étaient les codes actifs, mais ils
-- étaient déjà archivés depuis le 2026-08-11 (renommage/recréation
-- passés par Cindy via l'éditeur de rôles personnalisables). Les vrais
-- codes actifs qui alimentent encore l'affichage automatique "Maillots" /
-- "Table de marque" dans MatchTasksPanel sont MAILLOTS et
-- TABLE_DE_MARQUE (confirmé par un SELECT de Cindy le 2026-08-21).
update public.event_role_types
  set archived_at = now()
  where code in ('MAILLOTS', 'TABLE_DE_MARQUE') and archived_at is null;
