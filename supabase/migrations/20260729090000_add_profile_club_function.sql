-- Free-text "fonction au club" for ADMIN (Bureau) members, e.g. Président, Secrétaire, Comptable.
-- Populated automatically from the club_administrators whitelist (see next migration),
-- never chosen freely by the user at signup.
alter table public.profiles
  add column if not exists club_function text;
