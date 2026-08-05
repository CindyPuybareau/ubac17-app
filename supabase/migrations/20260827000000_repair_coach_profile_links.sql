-- One-time repair for the "coach invisible in their teams" bug: a coach
-- assignment made from a member's fiche only ever lands in the real
-- team_coaches table (which every "Coach" section app-wide reads from)
-- when that member's players row was already linked to their real account
-- (players.profile_id) at the time. If it wasn't linked yet, the
-- assignment silently went into team_pending_coaches instead — invisible
-- everywhere except the Membres table's own amber "en attente" badge.
-- Going forward, member-detail-modal.tsx self-heals this at save time;
-- this migration repairs whatever's already in that state today.

-- 1. Link any still-unlinked player row to its matching real account by
--    email (case-insensitive), same reconciliation as the earlier
--    20260815000000 migration, re-run defensively.
update public.players p
set profile_id = pr.id
from public.profiles pr
where p.profile_id is null
  and p.registration_email is not null
  and pr.email is not null
  and lower(p.registration_email) = lower(pr.email);

-- 2. Now that linkage is current, promote any "pending" coach assignment
--    for a player who turns out to already have a real account into the
--    real team_coaches table.
insert into public.team_coaches (team_id, coach_id)
select tpc.team_id, p.profile_id
from public.team_pending_coaches tpc
join public.players p on p.id = tpc.player_id
where p.profile_id is not null
on conflict (team_id, coach_id) do nothing;

-- 3. Drop the now-redundant pending rows for anyone just promoted above.
delete from public.team_pending_coaches tpc
using public.players p
where p.id = tpc.player_id
  and p.profile_id is not null;
