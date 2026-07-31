-- Lets a named-but-account-less coach show a "Coach {équipe}" badge in the
-- Membres table right away, by pointing at their actual player row instead
-- of waiting for a real profiles/team_coaches link (that part still needs
-- a real account — see teams.pending_coach_names for the free-text version
-- already shown on team cards). This is purely a display designation and
-- grants no access, same spirit as pending_coach_names.
alter table public.teams
  add column if not exists pending_coach_player_id uuid references public.players(id) on delete set null;

update public.teams t
set pending_coach_player_id = p.id
from public.players p
where p.first_name = 'Jules' and p.last_name = 'DARNIS'
  and t.name = 'U15M';

update public.teams t
set pending_coach_player_id = p.id
from public.players p
where p.first_name = 'Jean-Philippe' and p.last_name = 'MANZELLE'
  and t.name = 'U18M-1';

update public.teams t
set pending_coach_player_id = p.id
from public.players p
where p.first_name = 'Patrice' and p.last_name = 'BEQUIN'
  and t.name in ('U18M-2', 'U11 Mixte');

update public.teams t
set pending_coach_player_id = p.id
from public.players p
where p.first_name = 'Farid' and p.last_name = 'BAHRI'
  and t.name = 'U13M-1';

update public.teams t
set pending_coach_player_id = p.id
from public.players p
where p.first_name = 'Jean' and p.last_name = 'BOUYER-POINOT'
  and t.name in ('U13M-2', 'Babys');

update public.teams t
set pending_coach_player_id = p.id
from public.players p
where p.first_name = 'Michaël' and p.last_name = 'DÉRAND'
  and t.name = 'Loisirs Mixtes';

-- TOM (Séniors 2), CYRIL (Loisirs F) and LÉANE (U9 Mixte) are intentionally
-- left unset — the diagnostic query found 3 ambiguous "Tom" candidates and
-- no row at all matching Cyril/Léane/Bibiche, so Cindy needs to confirm
-- exact names before linking them safely.
