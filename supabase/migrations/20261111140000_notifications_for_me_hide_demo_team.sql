-- Retour de Cindy du 11/11 ("le vrai bureau reçoit les notifs de la démo") :
-- notifications_for_me() laisse le Bureau (is_club_admin()) lire TOUTE
-- notification sans restriction d'équipe (accès "100% club" voulu, voir
-- CLAUDE.md §3) -- une notification liée à l'équipe démo (is_demo) y
-- passait donc aussi. Seule cette branche change : équipe démo exclue de
-- cette lecture club-wide (les autres branches -- is_team_coach,
-- parent_player, players.profile_id -- restent déjà naturellement
-- exclues pour un vrai compte, qui n'est jamais rattaché à l'équipe démo).
create or replace function public.notifications_for_me(p_limit integer default 30)
returns table(id uuid, team_id uuid, team_name text, event_id uuid, title text, body text, url text, created_at timestamptz, read_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  select n.id, n.team_id, t.name, n.event_id, n.title, n.body, n.url, n.created_at, nr.read_at
  from public.notifications n
  left join public.teams t on t.id = n.team_id
  left join public.notification_reads nr on nr.notification_id = n.id and nr.profile_id = v_uid
  where
    n.created_at > now() - interval '14 days'
    and (
      (n.team_id is null and n.restricted_audience is null and n.target_profile_ids is null)
      or (
        public.is_club_admin()
        and (
          n.category is distinct from 'ORGANISATION_NEED'
          or (select cs.bureau_sees_all_organisation_needs from public.club_settings cs where cs.id = true)
        )
        and not exists (
          select 1 from public.teams t2 where t2.id = n.team_id and t2.is_demo
        )
      )
      or (n.restricted_audience = 'COACHS' and public.is_coach_anywhere())
      or public.is_team_coach(n.team_id)
      or n.team_id in (
        select tp.team_id from public.parent_player pp
        join public.team_players tp on tp.player_id = pp.player_id
        where pp.parent_id = v_uid
      )
      or n.team_id in (
        select tp2.team_id from public.players pl
        join public.team_players tp2 on tp2.player_id = pl.id
        where pl.profile_id = v_uid
      )
      or (n.target_profile_ids is not null and v_uid = any(n.target_profile_ids))
    )
  order by n.created_at desc
  limit p_limit;
end;
$function$;
