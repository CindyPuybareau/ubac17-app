-- Vue d'ensemble FFBB (écran Bureau) : jusqu'ici, savoir si une équipe
-- avait été synchronisée récemment demandait d'ouvrir chacune des 14
-- fiches une par une, aucune trace de la dernière synchro n'étant gardée
-- nulle part. Horodatage posé par /api/sync-ffbb juste après un appel
-- réussi à la fiche FFBB (succès = "on a bien parlé à la FFBB pour cette
-- équipe", que des matchs aient changé ou non) — pas une date de
-- modification de la ligne teams elle-même.
alter table public.teams
  add column if not exists ffbb_last_synced_at timestamptz;
