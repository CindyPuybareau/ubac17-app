-- A member (e.g. cindy.puybareau@o2.fr) can have a genuinely active
-- account yet still show up as "en attente de compte" because every
-- email-based match in this app (Membres table's "Coach de" badge, the
-- players<->profiles auto-link, this migration's own predecessor) relies
-- on profiles.email — a plain copy of auth.users.email, taken once at
-- signup. If that copy was ever null/stale for a given account (accounts
-- created before the 20260731030000 fix that restored `email = new.email`
-- in handle_new_user(), or any account whose email changed since), every
-- one of those matches silently fails even though the account itself is
-- perfectly real and active. Re-sync it from the one place it can never
-- be wrong: auth.users.

-- 1. Backfill/correct every profile's email straight from auth.users —
--    the authoritative source — so every downstream email-based match in
--    the app becomes reliable again, not just for one member.
update public.profiles p
set email = u.email
from auth.users u
where p.id = u.id
  and (
    p.email is null
    or trim(lower(p.email)) <> trim(lower(u.email))
  );

-- 2. Re-run the same unambiguous 1:1 players<->profiles reconciliation as
--    20260827000000, now that profiles.email is trustworthy again — this
--    is what may pick up cindy.puybareau@o2.fr and anyone else in the
--    same situation. trim() added this time too, in case of stray
--    whitespace in either column from a spreadsheet import.
with candidates as (
  select
    p.id as player_id,
    pr.id as profile_id,
    count(*) over (partition by pr.id) as dupes_per_profile,
    count(*) over (partition by p.id) as dupes_per_player
  from public.players p
  join public.profiles pr
    on p.registration_email is not null
   and pr.email is not null
   and trim(lower(p.registration_email)) = trim(lower(pr.email))
  where p.profile_id is null
    and not exists (
      select 1 from public.players existing where existing.profile_id = pr.id
    )
)
update public.players p
set profile_id = c.profile_id
from candidates c
where p.id = c.player_id
  and c.dupes_per_profile = 1
  and c.dupes_per_player = 1;

-- 3. Promote any "pending" coach assignment for a player who turns out to
--    already have a real account into the real team_coaches table.
insert into public.team_coaches (team_id, coach_id)
select tpc.team_id, p.profile_id
from public.team_pending_coaches tpc
join public.players p on p.id = tpc.player_id
where p.profile_id is not null
on conflict (team_id, coach_id) do nothing;

-- 4. Drop the now-redundant pending rows for anyone just promoted above.
delete from public.team_pending_coaches tpc
using public.players p
where p.id = tpc.player_id
  and p.profile_id is not null;
