-- Retour de Cindy du 13/11 ("Bilan de la saison - Joueurs") : la colonne
-- Entraînements ne couvrait que depuis le 1er octobre -- le bilan
-- réutilisait les entraînements chargés pour le Calendrier (mois affiché
-- +/- 1), pas la saison. U11 Mixte : 6 comptés pour 15 réels ; Séniors 1 :
-- aucun (tous en septembre).
--
-- Calcul fait en base, sur la saison entière, en un seul appel : pour
-- chaque joueur de l'effectif des équipes demandées, et chaque type
-- (entraînement, match officiel, amical, tournoi, autre), le nombre de
-- rendez-vous PASSÉS NON ANNULÉS de son équipe (total, identique pour tout
-- l'effectif -- une non-réponse compte comme absent, même règle que
-- training_presence_by_team) et le nombre de fois où il était Présent ou
-- En retard.
--
-- p_player_ids (facultatif) : limite aux joueurs voulus (un parent pour
-- ses enfants). Un joueur n'est compté que pour les équipes où il est
-- réellement inscrit (team_players) -- deux enfants dans deux équipes
-- différentes ne partagent jamais le même total.
--
-- security invoker : les règles d'accès habituelles s'appliquent (Bureau :
-- tout ; Coach : ses équipes ; parent : ses enfants). Lecture seule, rien
-- n'est modifié.
create or replace function public.season_participation(
  p_team_ids uuid[],
  p_from timestamptz,
  p_player_ids uuid[] default null
)
returns table(player_id uuid, kind text, present_count integer, total_count integer)
language sql
stable
security invoker
set search_path to 'public'
as $function$
  with ev as (
    select e.id, e.event_type, e.team_id, coalesce(e.target_team_ids, '{}'::uuid[]) as target_team_ids
    from public.events e
    where e.cancelled_at is null
      and e.start_time >= p_from
      and e.start_time < now()
      and e.event_type in ('TRAINING', 'MATCH', 'FRIENDLY', 'TOURNAMENT', 'OTHER')
      and (e.team_id = any(p_team_ids) or e.target_team_ids && p_team_ids)
  ),
  roster as (
    select tp.player_id, tp.team_id
    from public.team_players tp
    where tp.team_id = any(p_team_ids)
      and (p_player_ids is null or tp.player_id = any(p_player_ids))
  ),
  pairs as (
    -- distinct : un joueur inscrit dans deux équipes concernées par le
    -- même rendez-vous (target_team_ids) n'est compté qu'une fois.
    select distinct r.player_id, ev.id as event_id, ev.event_type
    from roster r
    join ev on ev.team_id = r.team_id or r.team_id = any(ev.target_team_ids)
  )
  select pa.player_id,
         case pa.event_type
           when 'TRAINING' then 'training'
           when 'MATCH' then 'official'
           when 'FRIENDLY' then 'friendly'
           when 'TOURNAMENT' then 'tournament'
           else 'other'
         end as kind,
         (count(*) filter (where rs.status in ('PRESENT', 'LATE')))::integer as present_count,
         count(*)::integer as total_count
  from pairs pa
  left join public.rsvps rs on rs.event_id = pa.event_id and rs.player_id = pa.player_id
  group by pa.player_id, pa.event_type;
$function$;

grant execute on function public.season_participation(uuid[], timestamptz, uuid[]) to authenticated;
