-- calendar_feed_events() ne couvrait que les équipes des enfants d'un
-- parent (via parent_player) et sa propre équipe de joueur (via
-- players.profile_id) — jamais les équipes qu'il entraîne. Un coach
-- générant son lien d'abonnement se serait retrouvé avec un agenda vide
-- de ses propres matchs et entraînements.
create or replace function public.calendar_feed_events(p_token uuid)
returns table (
  id uuid,
  title text,
  event_type text,
  is_home boolean,
  location text,
  salle text,
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
    e.start_time, e.end_time,
    coalesce(t.name, 'Tous les groupes') as team_name
  from public.events e
  left join public.teams t on t.id = e.team_id
  where e.team_id is null
     or e.team_id in (
       -- Équipes des enfants de ce parent.
       select tp.team_id
       from public.parent_player pp
       join public.team_players tp on tp.player_id = pp.player_id
       where pp.parent_id = v_profile_id
       union
       -- L'équipe du joueur lui-même, s'il a son propre compte (majeur).
       select tp2.team_id
       from public.players pl
       join public.team_players tp2 on tp2.player_id = pl.id
       where pl.profile_id = v_profile_id
       union
       -- Les équipes qu'il entraîne.
       select tc.team_id
       from public.team_coaches tc
       where tc.coach_id = v_profile_id
     )
  order by e.start_time;
end;
$$;
