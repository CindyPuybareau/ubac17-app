-- Retour de Cindy du 11/11 ("compte démo réaliste... ça ne doit pas
-- apparaître dans notre application de tous les jours") : marqueur pour
-- une équipe/compte entièrement fictifs (démo commerciale + prise en main
-- interne du Bureau), à exclure des listes "toutes les équipes" vues par
-- tout le monde (Bureau/Coach/Famille) -- jamais de l'équipe elle-même
-- pour le compte démo qui la coache/joue (résolue par team_coaches/
-- parent_player, pas par ces listes club-wide).
alter table public.teams
  add column if not exists is_demo boolean not null default false;
