-- Retour de Cindy du 07/11 ("les itinéraires ne sont pas bons") : l'agenda
-- externe (abonnement iCal, calendar_feed_events) affichait "Extérieur"
-- comme lieu pour un match extérieur -- même correctif que venueQuery
-- (salles.ts) côté appli, étendu ici à away_venue_address pour que le
-- LOCATION de chaque événement exporté pointe aussi sur la vraie salle
-- adverse une fois connue.
--
-- Postgres refuse un CREATE OR REPLACE qui change les colonnes d'une
-- fonction RETURNS TABLE (implémentées en paramètres OUT) : DROP + CREATE
-- obligatoire. Sans risque pour les données (une fonction, pas une table)
-- -- la fonction est immédiatement recréée dans la même transaction de
-- migration, jamais un instant sans elle en usage réel.
drop function if exists public.calendar_feed_events(uuid);

create function public.calendar_feed_events(p_token uuid)
returns table (
  id uuid,
  title text,
  event_type text,
  is_home boolean,
  location text,
  salle text,
  away_venue_address text,
  start_time timestamptz,
  end_time timestamptz,
  team_name text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p where p.calendar_token = p_token;
  if v_profile_id is null then
    return;
  end if;

  return query
  select
    e.id, e.title, e.event_type, e.is_home, e.location, e.salle,
    e.away_venue_address,
    e.start_time, e.end_time,
    coalesce(t.name, 'Tous les groupes') as team_name
  from public.events e
  left join public.teams t on t.id = e.team_id
  where (e.team_id is null and e.target_team_ids is null)
     or e.team_id in (
       select tp.team_id
       from public.parent_player pp
       join public.team_players tp on tp.player_id = pp.player_id
       where pp.parent_id = v_profile_id
       union
       select tp2.team_id
       from public.players pl
       join public.team_players tp2 on tp2.player_id = pl.id
       where pl.profile_id = v_profile_id
       union
       select tc.team_id
       from public.team_coaches tc
       where tc.coach_id = v_profile_id
     )
     or (
       e.target_team_ids is not null
       and e.target_team_ids && (
         select coalesce(array_agg(team_id), '{}') from (
           select tp.team_id
           from public.parent_player pp
           join public.team_players tp on tp.player_id = pp.player_id
           where pp.parent_id = v_profile_id
           union
           select tp2.team_id
           from public.players pl
           join public.team_players tp2 on tp2.player_id = pl.id
           where pl.profile_id = v_profile_id
           union
           select tc.team_id
           from public.team_coaches tc
           where tc.coach_id = v_profile_id
         ) as my_teams
       )
     )
  order by e.start_time;
end;
$$;
