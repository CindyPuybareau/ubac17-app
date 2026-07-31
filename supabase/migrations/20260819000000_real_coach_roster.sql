-- Replaces the single-slot teams.pending_coach_player_id with a proper
-- many-to-many join table, since Cindy's real coach roster (from her
-- "MAILS DES COACHS 2026-2027" file) has several teams with 2 co-coaches
-- (U13F, U18M-1, Séniors 1) that a single scalar column can't represent.
-- Mirrors team_coaches' own shape/RLS exactly.
create table if not exists public.team_pending_coaches (
  team_id uuid not null references public.teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

alter table public.team_pending_coaches enable row level security;

drop policy if exists "select all team_pending_coaches" on public.team_pending_coaches;
create policy "select all team_pending_coaches"
  on public.team_pending_coaches for select
  using (true);

drop policy if exists "admin manage team_pending_coaches" on public.team_pending_coaches;
create policy "admin manage team_pending_coaches"
  on public.team_pending_coaches for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select on public.team_pending_coaches to authenticated;
grant insert, update, delete on public.team_pending_coaches to authenticated;

-- Carry over the existing single-slot links (skips Tommy Robin — see below).
insert into public.team_pending_coaches (team_id, player_id)
select id, pending_coach_player_id
from public.teams
where pending_coach_player_id is not null
on conflict do nothing;

alter table public.teams drop column if exists pending_coach_player_id;

-- Tommy Robin was never a coach — Cindy's own correction. Nothing to
-- delete from team_pending_coaches (he was never migrated in above since
-- we're about to remove Séniors 2's link explicitly here anyway), but in
-- case the carry-over above did copy him, remove him explicitly.
delete from public.team_pending_coaches tpc
using public.players p
where tpc.player_id = p.id
  and p.first_name = 'Tommy' and p.last_name = 'ROBIN';

-- Fill in real surnames/emails for the two placeholder rows created
-- earlier (first-name-only, before we had their real details).
update public.players
set last_name = 'CHARPENTEAU', registration_email = 'cyril.charpenteau@gmail.com'
where first_name = 'Cyril' and last_name = '';

update public.players
set last_name = 'CHARPENTEAU',
    registration_email = 'chaleane05@gmail.com',
    registration_phone = '0634410647'
where first_name = 'Léane' and last_name = '';

-- New coaches revealed by the real roster file, with no existing player
-- record — minimal placeholder rows, same pattern as Cyril/Léane.
insert into public.players (first_name, last_name, registration_email)
values
  ('Thomas', 'JUDALET', 'toju17@gmail.com'),
  ('Aymeric', 'FERRY-WILCZEK', 'aymericfw@hotmail.fr'),
  ('Julien', 'HERVE', 'j.herve29@gmail.com'),
  ('Freddy', 'BARBIN', 'freddy.barbin23@gmail.com'),
  ('Bibiche', '', 'cdevillers2@orange.fr')
on conflict do nothing;

-- Link every pending (account-less) coach to their real team(s).
insert into public.team_pending_coaches (team_id, player_id)
select t.id, p.id
from public.teams t
join public.players p on (
  (t.name = 'U15M' and p.first_name = 'Jules' and p.last_name = 'DARNIS')
  or (t.name = 'U18M-1' and p.first_name = 'Jean-Philippe' and p.last_name = 'MANZELLE')
  or (t.name = 'U18M-1' and p.first_name = 'Freddy' and p.last_name = 'BARBIN')
  or (t.name = 'U18M-2' and p.first_name = 'Patrice' and p.last_name = 'BEQUIN')
  or (t.name = 'U11 Mixte' and p.first_name = 'Patrice' and p.last_name = 'BEQUIN')
  or (t.name = 'U13M-1' and p.first_name = 'Farid' and p.last_name = 'BAHRI')
  or (t.name = 'U13M-2' and p.first_name = 'Jean' and p.last_name = 'BOUYER-POINOT')
  or (t.name = 'Babys' and p.first_name = 'Jean' and p.last_name = 'BOUYER-POINOT')
  or (t.name = 'Loisirs Mixtes' and p.first_name = 'Michaël' and p.last_name = 'DÉRAND')
  or (t.name = 'Loisirs F' and p.first_name = 'Cyril' and p.last_name = 'CHARPENTEAU')
  or (t.name = 'U9 Mixte' and p.first_name = 'Léane' and p.last_name = 'CHARPENTEAU')
  or (t.name = 'Séniors 2' and p.first_name = 'Thomas' and p.last_name = 'JUDALET')
  or (t.name = 'Séniors 1' and p.first_name = 'Aymeric' and p.last_name = 'FERRY-WILCZEK')
  or (t.name = 'Séniors 1' and p.first_name = 'Julien' and p.last_name = 'HERVE')
  or (t.name = 'U13F' and p.first_name = 'Bibiche')
)
on conflict do nothing;

-- Auto-claim invites: the moment any of these emails signs up, the
-- existing handle_new_user() trigger (team_coach_invites -> team_coaches)
-- promotes them to a real coach automatically.
insert into public.team_coach_invites (team_id, email)
select t.id, v.email
from (values
  ('Babys', 'bjm.bouyer@gmail.com'),
  ('U9 Mixte', 'chaleane05@gmail.com'),
  ('U11 Mixte', 'patrice.bequin@gmail.com'),
  ('U13F', 'basile.lamouret@gmail.com'),
  ('U13F', 'cdevillers2@orange.fr'),
  ('U13M-1', 'basile.lamouret@gmail.com'),
  ('U13M-2', 'bjm.bouyer@gmail.com'),
  ('U15M', 'darnis.jules@gmail.com'),
  ('U18M-1', 'jpmanzelle@free.fr'),
  ('U18M-1', 'freddy.barbin23@gmail.com'),
  ('U18M-2', 'patrice.bequin@gmail.com'),
  ('Séniors 1', 'aymericfw@hotmail.fr'),
  ('Séniors 1', 'j.herve29@gmail.com'),
  ('Séniors 2', 'toju17@gmail.com'),
  ('Loisirs F', 'cyril.charpenteau@gmail.com'),
  ('Loisirs Mixtes', 'michael.derand@gmail.com')
) as v(team_name, email)
join public.teams t on t.name = v.team_name
on conflict do nothing;

-- Correct the free-text pending_coach_names shown on team cards — Séniors 1
-- was marked coachless (wrong, per the real roster) and Séniors 2 had
-- "TOM" (Cindy's mistaken guess, corrected to the real coach).
update public.teams set pending_coach_names = 'Aymeric FERRY-WILCZEK / Julien HERVE' where name = 'Séniors 1';
update public.teams set pending_coach_names = 'Thomas JUDALET' where name = 'Séniors 2';
update public.teams set pending_coach_names = 'Jean-Philippe MANZELLE (JP) / Freddy BARBIN' where name = 'U18M-1';

-- Extends the signup trigger: once a team_coach_invites row auto-claims a
-- real team_coaches link, also clear that same person's pending-coach
-- badge (team_pending_coaches) for the team(s) they were just invited to
-- — identified via their own player row, linked the same way profile_id
-- auto-linking already works.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_player_id uuid;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    new.email,
    'PARENT'
  );

  insert into public.parent_player (parent_id, player_id)
  select new.id, p.id
  from public.players p
  where p.pending_parent_email is not null
    and lower(p.pending_parent_email) = lower(new.email)
  on conflict do nothing;

  insert into public.team_coaches (team_id, coach_id)
  select tci.team_id, new.id
  from public.team_coach_invites tci
  where lower(tci.email) = lower(new.email)
  on conflict do nothing;

  update public.teams
  set pending_coach_names = null
  where id in (
    select tci.team_id
    from public.team_coach_invites tci
    where lower(tci.email) = lower(new.email)
  );

  update public.players
  set profile_id = new.id
  where profile_id is null
    and registration_email is not null
    and lower(registration_email) = lower(new.email)
    and (
      select count(*) from public.players p2
      where p2.registration_email is not null
        and lower(p2.registration_email) = lower(new.email)
    ) = 1
  returning id into linked_player_id;

  if linked_player_id is not null then
    delete from public.team_pending_coaches
    where player_id = linked_player_id
      and team_id in (
        select tci.team_id
        from public.team_coach_invites tci
        where lower(tci.email) = lower(new.email)
      );
  end if;

  return new;
end;
$$;
