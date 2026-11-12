-- Retour de Cindy du 12/11 ("Babys 100 % ? ce n'est pas possible, ils ne
-- pensent jamais à utiliser l'appli !") : le premier calcul
-- (training_attendance_by_team, présents / (présents + absents)) ignorait
-- les non-réponses -- 10 "présent" sur 27 enfants donnaient 100 %.
-- Décision de Cindy : calcul sur l'EFFECTIF, "un non-votant est considéré
-- comme absent".
--
-- Par équipe, sur la période : présents (Présent ou En retard) et nombre de
-- places attendues = effectif ACTUEL de l'équipe (joueurs non archivés) x
-- nombre d'entraînements passés non annulés. Taux = présents / attendus.
--
-- Nouveau nom plutôt que de modifier l'ancienne fonction : la version en
-- ligne de l'appli continue d'appeler l'ancienne jusqu'au déploiement.
-- security invoker (règles d'accès habituelles), lecture seule.
create or replace function public.training_presence_by_team(p_from timestamptz, p_to timestamptz)
returns table(team_id uuid, present_count integer, expected_count integer)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with trainings as (
    select e.id, e.team_id
    from public.events e
    where e.event_type = 'TRAINING'
      and e.cancelled_at is null
      and e.team_id is not null
      and e.start_time >= p_from
      and e.start_time < p_to
  ),
  roster as (
    select tp.team_id, count(*)::integer as size
    from public.team_players tp
    join public.players p on p.id = tp.player_id
    where p.archived_at is null
    group by tp.team_id
  ),
  present as (
    select t.team_id, count(*)::integer as n
    from trainings t
    join public.rsvps r on r.event_id = t.id
    where r.status in ('PRESENT', 'LATE')
    group by t.team_id
  ),
  sessions as (
    select team_id, count(*)::integer as n from trainings group by team_id
  )
  select s.team_id,
         coalesce(pr.n, 0) as present_count,
         (s.n * coalesce(ro.size, 0))::integer as expected_count
  from sessions s
  left join roster ro on ro.team_id = s.team_id
  left join present pr on pr.team_id = s.team_id;
$function$;

grant execute on function public.training_presence_by_team(timestamptz, timestamptz) to authenticated;
