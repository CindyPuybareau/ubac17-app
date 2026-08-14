-- Piste n°1 de l'audit Coach : un coach ne recevait jamais de notification
-- push, même sur un changement fait par un co-coach ou par le Bureau sur
-- SA propre équipe. Deux causes :
--
-- 1. push_targets_for_event() ne renvoyait que les parents et les joueurs
--    majeurs d'une équipe, jamais ses coachs eux-mêmes.
-- 2. Le bouton "Activer les notifications" (push-subscribe.tsx) n'était
--    monté que côté Bureau et Famille, jamais côté Coach — corrigé dans
--    coach-view.tsx, hors SQL.
--
-- L'ajout des coachs à la cible introduit un nouveau cas à traiter : sans
-- garde, un coach qui modifie ou demande les présences sur SON PROPRE
-- événement recevrait une notification sur sa propre action. D'où
-- l'exclusion explicite de l'appelant (auth.uid()) — nouvelle, absente de
-- la version précédente puisque jusqu'ici l'appelant (toujours coach ou
-- Bureau) n'était de toute façon jamais dans la liste des cibles.
create or replace function public.push_targets_for_event(p_event_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_exists boolean;
begin
  select e.team_id, true into v_team, v_exists
  from public.events e
  where e.id = p_event_id;

  if not coalesce(v_exists, false) then
    return;
  end if;

  -- Un événement club (team_id null) ne concerne aucune équipe en
  -- particulier : seul le Bureau peut le diffuser à tout le monde.
  if not (
    public.is_club_admin()
    or (v_team is not null and public.is_team_coach(v_team))
  ) then
    return;
  end if;

  return query
  select distinct s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.profile_id <> auth.uid()
    and s.profile_id in (
      -- Les parents des joueurs concernés.
      select pp.parent_id
      from public.parent_player pp
      join public.team_players tp on tp.player_id = pp.player_id
      where v_team is null or tp.team_id = v_team
      union
      -- Les joueurs qui ont leur propre compte (majeurs, séniors...).
      select pl.profile_id
      from public.players pl
      join public.team_players tp2 on tp2.player_id = pl.id
      where pl.profile_id is not null
        and (v_team is null or tp2.team_id = v_team)
      union
      -- Les coachs de l'équipe concernée (ou de toutes, sur un événement
      -- club) — jamais celui qui envoie lui-même, déjà exclu ci-dessus.
      select tc.coach_id
      from public.team_coaches tc
      where v_team is null or tc.team_id = v_team
    );
end;
$$;
