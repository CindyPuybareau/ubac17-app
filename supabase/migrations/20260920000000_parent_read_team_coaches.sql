-- Moitie manquante du correctif precedent (20260918).
--
-- Ce correctif autorisait un parent a lire la FICHE d'un coach (profiles),
-- mais pas la ligne qui rattache ce coach a l'equipe (team_coaches). La
-- requete part de team_coaches et embarque profiles : ligne invisible,
-- jointure jamais atteinte. La premiere moitie du chemin restait fermee.
--
-- Symptome exact rapporte : un coach est visible tant qu'il n'a pas de
-- compte — team_pending_coaches ayant une policy select ouverte a tous —
-- puis disparait le jour ou il s'inscrit et bascule dans team_coaches.
--
-- security definer, comme is_team_coach : interroge team_players et
-- parent_player sans repasser par leurs propres policies, ce qui evite la
-- recursion RLS deja rencontree sur ces tables.
create or replace function public.is_my_child_team(check_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.team_players tp
    join public.parent_player pp on pp.player_id = tp.player_id
    where tp.team_id = check_team_id
      and pp.parent_id = auth.uid()
  );
$$;

grant execute on function public.is_my_child_team(uuid) to authenticated;

drop policy if exists "parent select coaches of own child teams" on public.team_coaches;
create policy "parent select coaches of own child teams"
  on public.team_coaches for select
  using (public.is_my_child_team(team_id));
