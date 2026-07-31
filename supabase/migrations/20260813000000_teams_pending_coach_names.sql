-- Display-only placeholder for a team's assigned coach before they have a
-- real account — mirrors the existing players.pending_parent_email
-- pattern. Cleared and replaced by a real public.team_coaches row once
-- the person signs up and the Bureau links their account.
alter table public.teams
  add column if not exists pending_coach_names text;

update public.teams set pending_coach_names = 'TOM' where name = 'Séniors 2';
update public.teams set pending_coach_names = 'Jean-Philippe MANZELLE (JP)' where name = 'U18M-1';
update public.teams set pending_coach_names = 'Patrice BEQUIN (PAT)' where name = 'U18M-2';
update public.teams set pending_coach_names = 'Jules DARNIS' where name = 'U15M';
update public.teams set pending_coach_names = 'BIBICHE' where name = 'U13F';
update public.teams set pending_coach_names = 'Farid BAHRI (FARID)' where name = 'U13M-1';
update public.teams set pending_coach_names = 'Jean BOUYER-POINOT (JEAN)' where name = 'U13M-2';
update public.teams set pending_coach_names = 'Patrice BEQUIN (PAT)' where name = 'U11 Mixte';
update public.teams set pending_coach_names = 'LÉANE' where name = 'U9 Mixte';
update public.teams set pending_coach_names = 'Jean BOUYER-POINOT (JEAN)' where name = 'Babys';
update public.teams set pending_coach_names = 'CYRIL' where name = 'Loisirs F';
update public.teams set pending_coach_names = 'MICHAËL' where name = 'Loisirs Mixtes';
-- Séniors 1 intentionally left without a coach, per the club's instruction.
