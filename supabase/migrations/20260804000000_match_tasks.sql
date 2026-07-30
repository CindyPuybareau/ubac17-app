-- Match-day parent organization: who's washing jerseys, who's bringing the
-- snack, and how many carpool seats each family is offering.

create table if not exists public.event_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  task_type text not null check (task_type in ('JERSEYS', 'SNACKS')),
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (event_id, task_type)
);

alter table public.event_tasks enable row level security;

drop policy if exists "select event_tasks for own context" on public.event_tasks;
create policy "select event_tasks for own context"
  on public.event_tasks for select
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1
      from public.events e
      join public.team_players tp on tp.team_id = e.team_id
      join public.parent_player pp on pp.player_id = tp.player_id
      where e.id = event_tasks.event_id and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "assign event_tasks for own context" on public.event_tasks;
create policy "assign event_tasks for own context"
  on public.event_tasks for insert
  with check (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or (
      exists (
        select 1 from public.parent_player pp
        where pp.player_id = event_tasks.player_id and pp.parent_id = auth.uid()
      )
      and exists (
        select 1
        from public.events e
        join public.team_players tp on tp.team_id = e.team_id
        where e.id = event_tasks.event_id and tp.player_id = event_tasks.player_id
      )
    )
  );

drop policy if exists "update event_tasks for own context" on public.event_tasks;
create policy "update event_tasks for own context"
  on public.event_tasks for update
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
  );

drop policy if exists "delete event_tasks for own context" on public.event_tasks;
create policy "delete event_tasks for own context"
  on public.event_tasks for delete
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_tasks.player_id and pp.parent_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.event_tasks to authenticated;

create table if not exists public.event_carpool_offers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seats integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (event_id, player_id)
);

alter table public.event_carpool_offers enable row level security;

drop policy if exists "select carpool offers for own context" on public.event_carpool_offers;
create policy "select carpool offers for own context"
  on public.event_carpool_offers for select
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_carpool_offers.event_id and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1
      from public.events e
      join public.team_players tp on tp.team_id = e.team_id
      join public.parent_player pp on pp.player_id = tp.player_id
      where e.id = event_carpool_offers.event_id and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "insert own carpool offers" on public.event_carpool_offers;
create policy "insert own carpool offers"
  on public.event_carpool_offers for insert
  with check (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_offers.player_id and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "update own carpool offers" on public.event_carpool_offers;
create policy "update own carpool offers"
  on public.event_carpool_offers for update
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_offers.player_id and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "delete own carpool offers" on public.event_carpool_offers;
create policy "delete own carpool offers"
  on public.event_carpool_offers for delete
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_offers.player_id and pp.parent_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.event_carpool_offers to authenticated;
