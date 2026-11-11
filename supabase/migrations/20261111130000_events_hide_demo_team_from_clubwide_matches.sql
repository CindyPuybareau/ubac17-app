-- Retour de Cindy du 11/11 ("ajouter des matchs... non visible que côté
-- démo !!!") : la policy "select events (consolidated)" rend tout
-- match/amical lisible par N'IMPORTE QUEL compte connecté (clause pensée
-- pour le bouton "Afficher aussi les matchs officiels des autres équipes
-- du club"), sans la moindre restriction d'équipe -- un faux match sur
-- l'équipe démo (is_demo) serait donc remonté chez tout le monde qui
-- active ce bouton. Seule cette dernière clause change : équipe démo
-- exclue de cette lecture club-wide (le Bureau garde un accès total via
-- is_club_admin(), déjà filtré côté app -- voir page.tsx/adminEventsData).
drop policy if exists "select events (consolidated)" on public.events;

create policy "select events (consolidated)" on public.events
for select
using (
  is_club_admin()
  or ((team_id is null) and (target_team_ids is null) and (event_type <> 'REUNION'))
  or ((team_id is null) and (target_team_ids is null) and (event_type = 'REUNION') and (restricted_audience = 'COACHS') and is_coach_anywhere())
  or is_team_coach(team_id)
  or is_own_player_team(team_id)
  or exists (
    select 1 from team_players tp
    join parent_player pp on pp.player_id = tp.player_id
    where tp.team_id = events.team_id and pp.parent_id = (select auth.uid())
  )
  or (
    (target_team_ids is not null)
    and (
      exists (select 1 from team_coaches tc where tc.coach_id = (select auth.uid()) and tc.team_id = any (events.target_team_ids))
      or exists (
        select 1 from team_players tp2
        join players pl on pl.id = tp2.player_id
        where tp2.team_id = any (events.target_team_ids) and pl.profile_id = (select auth.uid())
      )
      or exists (
        select 1 from team_players tp3
        join parent_player pp2 on pp2.player_id = tp3.player_id
        where tp3.team_id = any (events.target_team_ids) and pp2.parent_id = (select auth.uid())
      )
    )
  )
  or ((target_profile_ids is not null) and ((select auth.uid()) = any (target_profile_ids)))
  or (
    (event_type = any (array['MATCH','FRIENDLY']))
    and ((select auth.uid()) is not null)
    and not exists (
      select 1 from public.teams t where t.id = events.team_id and t.is_demo
    )
  )
);
