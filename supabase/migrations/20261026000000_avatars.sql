-- Photo de profil façon Facebook (retour de Cindy du 2026-08-22), visible
-- dans les 4 espaces : un rond de photo + petite icône appareil photo pour
-- la changer.
alter table public.profiles add column if not exists avatar_url text;
alter table public.players add column if not exists avatar_url text;

-- Bucket public en lecture (les photos s'affichent partout dans l'appli,
-- pas seulement pour soi-même) — l'écriture est restreinte par les
-- policies storage.objects ci-dessous.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Bureau/Coach/Famille (vraie session Supabase Auth) : chacun ne peut
-- écrire que dans son propre dossier, nommé d'après son auth.uid()
-- (convention de chemin : "{uid}/avatar.xxx").
create policy "users manage own avatar folder"
  on storage.objects for all
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Espace Enfant : pas de session Supabase Auth (accès par code PIN, voir
-- child-session.ts), donc pas d'auth.uid() pour cette policy — l'upload
-- passe par /api/child-avatar en service_role (qui bypasse la RLS), sous
-- le préfixe "players/{playerId}/", jamais directement depuis le
-- navigateur.
create policy "public read avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');
