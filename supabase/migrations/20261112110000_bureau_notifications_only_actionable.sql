-- Audit visuel du 12/11 (validé par Cindy) : la cloche du Bureau recevait
-- TOUTES les notifications de TOUTES les équipes (plus de 30 en 4 jours :
-- "Événement modifié" de chaque équipe, "Nouveau joueur dans l'équipe",
-- un "Besoin bénévole non pourvu" par besoin et par jour...) -- tellement
-- qu'on ne les lisait plus, y compris celles qui comptent.
--
-- Désormais, un compte Bureau reçoit dans sa cloche :
--   - les notifications club entier (inchangé, comme tout le monde) ;
--   - celles réservées au Bureau (restricted_audience = 'BUREAU'), dont le
--     nouveau récapitulatif quotidien "Besoins bénévoles à pourvoir"
--     (/api/cron/bureau-alerts), qui remplace la relance besoin par besoin ;
--   - les besoins d'organisation (ORGANISATION_NEED) si l'interrupteur
--     Bureau "voir tous les besoins" est activé (inchangé) ;
--   - et, comme n'importe qui, celles des équipes qu'il coache, où il joue,
--     ou où jouent ses enfants (branches inchangées plus bas).
-- Il ne reçoit plus les notifications des AUTRES équipes. Les familles et
-- les coachs, eux, ne voient aucune différence.
--
-- Aucune donnée touchée : seule la sélection faite par cette fonction change.
create or replace function public.notifications_for_me(p_limit integer default 30)
 returns table(id uuid, team_id uuid, team_name text, event_id uuid, title text, body text, url text, created_at timestamp with time zone, read_at timestamp with time zone)
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
          -- Réservées au Bureau (sans équipe ni personne ciblée).
          (n.team_id is null and n.target_team_ids is null and n.target_profile_ids is null)
          or (
            n.category = 'ORGANISATION_NEED'
            and (select cs.bureau_sees_all_organisation_needs from public.club_settings cs where cs.id = true)
          )
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
