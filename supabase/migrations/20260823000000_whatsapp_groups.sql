-- Centralized WhatsApp group directory: unlike teams.whatsapp_group_link
-- (one quick link per team, still used by the existing Équipe-tab editor),
-- this covers BOTH team groups and commission/admin groups that have no
-- roster of their own (Bureau, Buvette, Comité directeur...), with an
-- explicit, independently-curated membership list per group — because a
-- real WhatsApp group's membership doesn't automatically track the app's
-- team roster (people get added/removed by hand on WhatsApp itself).
create table if not exists public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('EQUIPE', 'COMMISSION')),
  team_id uuid references public.teams(id) on delete set null,
  invite_link text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.whatsapp_group_members (
  group_id uuid not null references public.whatsapp_groups(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (group_id, player_id)
);

alter table public.whatsapp_groups enable row level security;
alter table public.whatsapp_group_members enable row level security;

-- Membership check used by the read policies below: is this authenticated
-- user (as themself, or as a parent of one of their linked players) a
-- member of the given group?
create or replace function public.is_whatsapp_group_member(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.whatsapp_group_members m
    join public.players p on p.id = m.player_id
    where m.group_id = gid
      and (
        p.profile_id = auth.uid()
        or exists (
          select 1 from public.parent_player pp
          where pp.player_id = p.id and pp.parent_id = auth.uid()
        )
      )
  );
$$;

-- Is this authenticated user a coach of the team this group is linked to
-- (irrelevant/false for commission groups, which have team_id null)?
create or replace function public.is_whatsapp_group_team_coach(gid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.whatsapp_groups g
    join public.team_coaches tc on tc.team_id = g.team_id
    where g.id = gid and tc.coach_id = auth.uid()
  );
$$;

-- whatsapp_groups: Bureau sees/manages everything. A coach sees (and can
-- edit the link for) groups tied to a team they coach, plus any group
-- they're personally a member of (read-only for those). Everyone else
-- only sees groups they belong to — never the full catalogue.
drop policy if exists "select whatsapp groups" on public.whatsapp_groups;
create policy "select whatsapp groups"
  on public.whatsapp_groups for select
  using (
    public.is_club_admin()
    or public.is_whatsapp_group_team_coach(id)
    or public.is_whatsapp_group_member(id)
  );

drop policy if exists "admin manage whatsapp groups" on public.whatsapp_groups;
create policy "admin manage whatsapp groups"
  on public.whatsapp_groups for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

drop policy if exists "coach update own team whatsapp group" on public.whatsapp_groups;
create policy "coach update own team whatsapp group"
  on public.whatsapp_groups for update
  using (public.is_whatsapp_group_team_coach(id))
  with check (public.is_whatsapp_group_team_coach(id));

-- whatsapp_group_members: Bureau full access. A coach can see/manage
-- members of groups tied to their own team(s). Anyone else only sees
-- their own (or their linked children's) membership rows — enough to
-- know which groups to show a "Rejoindre" card for, never the full roster.
drop policy if exists "select whatsapp group members" on public.whatsapp_group_members;
create policy "select whatsapp group members"
  on public.whatsapp_group_members for select
  using (
    public.is_club_admin()
    or public.is_whatsapp_group_team_coach(group_id)
    or exists (
      select 1 from public.players p
      where p.id = whatsapp_group_members.player_id
        and (
          p.profile_id = auth.uid()
          or exists (
            select 1 from public.parent_player pp
            where pp.player_id = p.id and pp.parent_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "manage whatsapp group members" on public.whatsapp_group_members;
create policy "manage whatsapp group members"
  on public.whatsapp_group_members for all
  using (
    public.is_club_admin()
    or public.is_whatsapp_group_team_coach(group_id)
  )
  with check (
    public.is_club_admin()
    or public.is_whatsapp_group_team_coach(group_id)
  );

grant select, insert, update, delete on public.whatsapp_groups to authenticated;
grant select, insert, update, delete on public.whatsapp_group_members to authenticated;

-- Seed the club's current real-world groups (invite links left blank —
-- Cindy fills those in from the new "Groupes WhatsApp" screen). team_id
-- is only set where the name unambiguously matches an existing team;
-- "U13G"/"U13G 2" are assumed to be U13M-1/U13M-2 (the club's own
-- WhatsApp naming uses "G" for Garçons where the app uses "M" for
-- Masculin) — worth Cindy double-checking those two specifically.
insert into public.whatsapp_groups (name, category, team_id, sort_order)
select v.name, v.category, t.id, v.sort_order
from (values
  ('U13 Filles UBAC 2026/27', 'EQUIPE', 'U13F', 10),
  ('U13M UBAC 2026/27', 'EQUIPE', 'U13M', 20),
  ('U13G UBAC 2026/27', 'EQUIPE', 'U13M-1', 30),
  ('U13G 2 UBAC 2026/27', 'EQUIPE', 'U13M-2', 40),
  ('U11 UBAC 2026/27', 'EQUIPE', 'U11 Mixte', 50),
  ('Baby UBAC 2026/27', 'EQUIPE', 'Babys', 60),
  ('U18M 1 UBAC 2026/27', 'EQUIPE', 'U18M-1', 70),
  ('U18M 2 UBAC 2026/27', 'EQUIPE', 'U18M-2', 80),
  ('Séniors M1 UBAC 2026/27', 'EQUIPE', 'Séniors 1', 90),
  ('Loisirs Filles Basket Apéro 2026/27', 'EQUIPE', 'Loisirs F', 100),
  ('Loisirs Mixtes UBAC 2026/27', 'EQUIPE', 'Loisirs Mixtes', 110),
  ('U15M UBAC', 'EQUIPE', 'U15M', 120)
) as v(name, category, team_name, sort_order)
left join public.teams t on t.name = v.team_name
on conflict do nothing;

insert into public.whatsapp_groups (name, category, sort_order)
values
  ('Comité directeur 2026/27', 'COMMISSION', 200),
  ('Bureau', 'COMMISSION', 210),
  ('Coachs UBAC', 'COMMISSION', 220),
  ('Team communication', 'COMMISSION', 230),
  ('Animations et événements', 'COMMISSION', 240),
  ('Buvette', 'COMMISSION', 250),
  ('Calendrier et dates à retenir', 'COMMISSION', 260),
  ('Commission sponsors', 'COMMISSION', 270),
  ('Salariés', 'COMMISSION', 280)
on conflict do nothing;

-- 360°-sync: membership/link changes by one Bureau/Coach session should
-- reach other open sessions live, same as every other synced table.
do $$
declare
  t text;
begin
  foreach t in array array['whatsapp_groups', 'whatsapp_group_members']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
