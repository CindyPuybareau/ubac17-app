-- Espace Coach > Équipe(s) : un coach qui est aussi joueur doit pouvoir
-- consulter l'effectif de SON équipe de joueur, pas seulement des équipes
-- qu'il entraîne (ex: Basile, coach U13F/U13M-1 et joueur en Séniors 1).
--
-- Jusqu'ici toutes les policies de lecture d'effectif passaient par
-- team_coaches : sur son équipe de joueur, il ne voyait que sa propre
-- ligne. On ouvre donc la lecture aux équipes dont il est membre — mais
-- uniquement s'il est coach quelque part, pour que cette ouverture reste
-- cantonnée à l'Espace Coach et ne donne pas à chaque licencié la vue sur
-- les coordonnées de ses coéquipiers.
--
-- Toutes les fonctions sont security definer : elles contournent la RLS
-- des tables qu'elles interrogent au lieu d'y ré-entrer, comme
-- is_team_coach() / player_on_coached_team() / is_own_player() déjà en
-- place — sans quoi team_players <-> players reboucleraient à l'infini.

-- Coach d'au moins une équipe, compte lié (team_coaches) ou pas encore
-- (team_pending_coaches, via sa fiche joueur) : mêmes deux sources que le
-- calcul de isCoach côté dashboard.
create or replace function public.is_coach_anywhere()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_coaches tc where tc.coach_id = auth.uid()
  ) or exists (
    select 1
    from public.team_pending_coaches tpc
    join public.players p on p.id = tpc.player_id
    where p.profile_id = auth.uid()
  );
$$;

-- Équipe dont l'utilisateur courant fait partie en tant que joueur.
create or replace function public.is_own_player_team(check_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.team_players tp
    join public.players p on p.id = tp.player_id
    where tp.team_id = check_team_id and p.profile_id = auth.uid()
  );
$$;

-- Joueur figurant sur une des équipes de l'utilisateur courant (= un
-- coéquipier).
create or replace function public.player_on_own_team(check_player_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.team_players tp
    where tp.player_id = check_player_id
      and public.is_own_player_team(tp.team_id)
  );
$$;

-- 1. L'effectif lui-même.
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
  );

-- 2. Les fiches des coéquipiers (nom, année, licence...).
drop policy if exists "coach select roster of own player teams" on public.players;
create policy "coach select roster of own player teams"
  on public.players for select
  using (public.is_coach_anywhere() and public.player_on_own_team(players.id));

-- 3. Les coachs de cette équipe (pour les afficher dans la carte).
drop policy if exists "coach select coaches of own player teams" on public.team_coaches;
create policy "coach select coaches of own player teams"
  on public.team_coaches for select
  using (public.is_coach_anywhere() and public.is_own_player_team(team_coaches.team_id));

drop policy if exists "coach select pending coaches of own player teams"
  on public.team_pending_coaches;
create policy "coach select pending coaches of own player teams"
  on public.team_pending_coaches for select
  using (
    public.is_coach_anywhere() and public.is_own_player_team(team_pending_coaches.team_id)
  );

-- 4. Les tuteurs des coéquipiers mineurs, et leurs coordonnées.
drop policy if exists "coach select parent_player of own player teams" on public.parent_player;
create policy "coach select parent_player of own player teams"
  on public.parent_player for select
  using (public.is_coach_anywhere() and public.player_on_own_team(parent_player.player_id));

drop policy if exists "coach select parent profiles of own player teams" on public.profiles;
create policy "coach select parent profiles of own player teams"
  on public.profiles for select
  using (
    public.is_coach_anywhere()
    and exists (
      select 1 from public.parent_player pp
      where pp.parent_id = profiles.id and public.player_on_own_team(pp.player_id)
    )
  );

drop policy if exists "coach select coach profiles of own player teams" on public.profiles;
create policy "coach select coach profiles of own player teams"
  on public.profiles for select
  using (
    public.is_coach_anywhere()
    and exists (
      select 1 from public.team_coaches tc
      where tc.coach_id = profiles.id and public.is_own_player_team(tc.team_id)
    )
  );
