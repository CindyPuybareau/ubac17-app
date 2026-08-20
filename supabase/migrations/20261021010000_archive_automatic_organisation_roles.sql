-- Retour de Cindy du 2026-08-21 (capture d'écran : "Table de marque"
-- apparaît deux fois — une fois via le catalogue automatique
-- (MatchTasksPanel, ancien système), une fois via un besoin ajouté à la
-- main dans "+ Ajouter un besoin" (VolunteerNeedsPanel, nouveau système)).
-- Décision : plus aucun besoin automatique — les entraînements n'en ont
-- déjà jamais eu, et pour tout le reste (matchs, tournois...), coachs et
-- Bureau définiront désormais tout à la main via "+ Ajouter un besoin".
--
-- Archivage plutôt que suppression (même principe que 20261016000000) :
-- les attributions déjà faites cette saison restent intactes et
-- continuent de compter dans le Bilan de saison (Coach > Équipe(s)).
-- getEventRoleTypes() exclut déjà les lignes archivées (archived_at is
-- null), donc MatchTasksPanel n'affichera plus aucune ligne automatique
-- (Maillots / Goûter / Table de marque) à partir de maintenant, sur
-- aucun événement.
update public.event_role_types
  set archived_at = now()
  where code in ('JERSEYS', 'SNACKS', 'TABLE_MARQUE') and archived_at is null;
