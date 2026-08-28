-- Trouvé lors de l'audit de sécurité du 28/08 : calendar_token
-- (20260923000000) et family_access_code (20261008000000) vivent sur
-- `profiles`, une table lue en entier par plusieurs policies "cross-
-- compte" (coach qui lit les parents de son équipe, parent qui lit les
-- coachs de l'équipe de son enfant...). La RLS est ligne-à-ligne : une
-- fois une ligne autorisée, TOUTES ses colonnes le sont, donc ces deux
-- jetons d'accès (calendrier ICS et espace enfant) étaient lisibles par
-- n'importe quel coach/parent en ciblant directement l'API REST, même si
-- l'appli elle-même ne les demande jamais dans ces contextes.
--
-- Sécurité par colonne plutôt que par ligne pour ces deux-là : personne
-- ne peut plus les lire directement, pas même son propre profil — la
-- lecture ne passe plus que par ces deux fonctions security definer
-- (même principe que regenerate_calendar_token/regenerate_family_access_
-- code juste à côté, qui déjà n'écrivaient qu'en `where id = auth.uid()`).
revoke select (calendar_token, family_access_code) on public.profiles from authenticated;

create or replace function public.my_calendar_token()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select calendar_token from public.profiles where id = auth.uid();
$$;

grant execute on function public.my_calendar_token() to authenticated;

create or replace function public.my_family_access_code()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select family_access_code from public.profiles where id = auth.uid();
$$;

grant execute on function public.my_family_access_code() to authenticated;

-- Filet de sécurité : si la RLS n'était pas (ou plus) activée sur
-- `profiles`, les policies qui la protègent ne s'appliqueraient jamais et
-- toute la table serait lisible par quiconque est connecté. Idempotent —
-- sans effet si elle est déjà active.
alter table public.profiles enable row level security;
