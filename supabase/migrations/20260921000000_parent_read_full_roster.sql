-- Un parent ne voyait que la ligne d'effectif de SON enfant, jamais celle
-- des coequipiers.
--
-- "select team_players for own context" autorise un parent a lire une
-- ligne team_players seulement quand pp.player_id = CETTE ligne, c'est-a-
-- dire seulement la sienne. La carte d'equipe cote parent affiche donc un
-- seul nom dans JOUEURS, quel que soit l'effectif reel de l'equipe.
--
-- is_my_child_team(), deja ecrite pour team_coaches (20260920), regle
-- exactement le meme probleme ici : autoriser la lecture de toutes les
-- lignes team_players d'une equipe ou l'appelant a un enfant, pas
-- seulement la ligne de son enfant.
drop policy if exists "select team_players for own context" on public.team_players;
create policy "select team_players for own context"
  on public.team_players for select
  using (
    exists (
      select 1 from public.team_coaches tc
      where tc.team_id = team_players.team_id and tc.coach_id = auth.uid()
    )
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = team_players.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(team_players.player_id)
    or (public.is_coach_anywhere() and public.is_own_player_team(team_players.team_id))
    or public.is_my_child_team(team_players.team_id)
  );

-- Meme trou une marche plus loin : meme si la ligne team_players devient
-- lisible, la fiche du coequipier (players : prenom, nom, date de
-- naissance) doit elle aussi etre lisible pour que la jointure ne rende
-- pas des lignes vides.
create or replace function public.is_teammate_of_my_child(target_player_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.team_players tp
    where tp.player_id = target_player_id
      and public.is_my_child_team(tp.team_id)
  );
$$;

grant execute on function public.is_teammate_of_my_child(uuid) to authenticated;

drop policy if exists "parent select teammates of own child teams" on public.players;
create policy "parent select teammates of own child teams"
  on public.players for select
  using (public.is_teammate_of_my_child(players.id));
