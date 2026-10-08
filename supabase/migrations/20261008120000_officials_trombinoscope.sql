-- Retour de Cindy du 08/10 ("trombinoscope officiels... concerne les
-- parents, les coachs et le bureau") : un seul fichier pour tout le club
-- (les officiels -- e-marque, chronométreur... -- ne sont jamais rattachés
-- à une seule équipe, contrairement aux joueurs). Stocké sur club_settings
-- (table à une seule ligne, id=true) plutôt que teams -- pas de notion
-- d'équipe mère ici. Bucket dédié (pas team-trombinoscopes, dont les
-- policies attendent un id d'équipe dans le chemin) : lecture ouverte à
-- TOUT compte connecté (Bureau, Coach, parent), écriture réservée au
-- Bureau -- voir club-documents.tsx pour l'affichage (onglet "Documents",
-- aux côtés des chartes).

alter table public.club_settings add column if not exists officials_trombinoscope_path text;

insert into storage.buckets (id, name, public)
values ('club-documents', 'club-documents', false)
on conflict (id) do nothing;

update storage.buckets
set
  file_size_limit = 26214400,
  allowed_mime_types = array['application/pdf']
where id = 'club-documents';

create policy "admin insert club documents"
  on storage.objects for insert
  with check (bucket_id = 'club-documents' and public.is_club_admin());

create policy "admin update club documents"
  on storage.objects for update
  using (bucket_id = 'club-documents' and public.is_club_admin())
  with check (bucket_id = 'club-documents' and public.is_club_admin());

create policy "admin delete club documents"
  on storage.objects for delete
  using (bucket_id = 'club-documents' and public.is_club_admin());

-- N'importe quel compte connecté (Bureau, Coach, parent) -- pas de notion
-- de "coach uniquement" ici contrairement au trombinoscope équipe, les
-- parents peuvent se proposer e-marque/chronométreur et doivent pouvoir
-- vérifier qui est qui.
create policy "any authenticated read club documents"
  on storage.objects for select
  using (bucket_id = 'club-documents' and (select auth.uid()) is not null);
