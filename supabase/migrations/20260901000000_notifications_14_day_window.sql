-- Retour de Cindy du 2026-09-01 ("trop de notifications qui s'accumulent") :
-- notifications_for_me() ne renvoyait que les 30 dernières, sans jamais
-- regarder leur date -- une notification ne disparaissait donc du menu de
-- la cloche que lorsque 30 nouvelles l'avaient poussee hors de la liste,
-- ce qui pouvait prendre des mois pour une equipe peu active. Ajoute une
-- fenetre de 14 jours : au-dela, une notification sort automatiquement du
-- menu sans qu'il y ait quoi que ce soit a faire. p_limit (30) reste en
-- filet de securite pour une equipe tres active.
create or replace function public.notifications_for_me(p_limit int default 30)
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  event_id uuid,
  title text,
  body text,
  url text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
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
      n.team_id is null
      or public.is_club_admin()
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
    )
  order by n.created_at desc
  limit p_limit;
end;
$$;
