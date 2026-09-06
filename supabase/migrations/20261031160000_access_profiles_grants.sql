-- Correctif (retour de Cindy du 06/09, "permission denied for table
-- access_profiles") : la migration 20261031130000 créait les tables
-- access_profiles/access_profile_briques mais oubliait d'activer la RLS et
-- d'accorder les droits au rôle authenticated -- contrairement à toutes
-- les autres tables réservées au Bureau (voir 20261027000000_benevoles.sql
-- pour le même motif exact). Sans ça, Postgres refuse l'accès avant même
-- d'évaluer une policy RLS, d'où le message "permission denied" plutôt
-- qu'un rejet RLS classique.
alter table public.access_profiles enable row level security;

create policy "admin manage access profiles"
  on public.access_profiles
  for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.access_profiles to authenticated;

alter table public.access_profile_briques enable row level security;

create policy "admin manage access profile briques"
  on public.access_profile_briques
  for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.access_profile_briques to authenticated;

-- Sync 360° (règle CLAUDE.md #4) : un profil créé/modifié doit apparaître
-- côté Bureau sans F5, même principe que benevoles/event_benevole_invites.
do $$
declare
  t text;
begin
  foreach t in array array['access_profiles', 'access_profile_briques']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
