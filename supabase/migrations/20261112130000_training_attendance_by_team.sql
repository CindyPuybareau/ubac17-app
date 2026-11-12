-- Retour de Cindy du 12/11 ("le taux de présence aux entraînements... il
-- montre l'engagement et repère les équipes qui décrochent") : indicateur
-- du tableau de bord Bureau (lib/space-dashboard.ts).
--
-- Compte, par équipe, les réponses Présent (ou En retard) et Absent aux
-- entraînements NON annulés d'une période donnée -- agrégé en base (une
-- ligne par équipe) plutôt que de rapatrier des centaines de réponses
-- individuelles (CLAUDE.md §6). Le taux affiché = présents / (présents +
-- absents) : une famille qui n'a pas répondu ne compte ni comme présente
-- ni comme absente.
--
-- security invoker : les règles d'accès habituelles de events/rsvps
-- s'appliquent (le Bureau voit tout le club, personne d'autre n'appelle
-- cette fonction). Lecture seule, aucune donnée modifiée.
create or replace function public.training_attendance_by_team(p_from timestamptz, p_to timestamptz)
returns table(team_id uuid, present_count integer, absent_count integer)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select
    e.team_id,
    (count(*) filter (where r.status in ('PRESENT', 'LATE')))::integer,
    (count(*) filter (where r.status = 'ABSENT'))::integer
  from public.events e
  join public.rsvps r on r.event_id = e.id
  where e.event_type = 'TRAINING'
    and e.cancelled_at is null
    and e.team_id is not null
    and e.start_time >= p_from
    and e.start_time < p_to
  group by e.team_id;
$function$;

grant execute on function public.training_attendance_by_team(timestamptz, timestamptz) to authenticated;
