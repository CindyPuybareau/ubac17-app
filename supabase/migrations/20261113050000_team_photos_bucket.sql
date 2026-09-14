-- Retour de Cindy du 13/09 ("photo d'équipe" dans le nouveau Tableau de
-- bord Coach/Famille, "ce sera des portraits") : même principe que le
-- bucket sponsor-logos (20261030000000) -- public en lecture, écriture
-- restreinte -- mais ici le Bureau ET le coach de CETTE équipe peuvent
-- l'envoyer (lui seul a la vraie photo posée de son équipe). Chemin
-- toujours "<team_id>/photo.<ext>" : storage.foldername(name)[1] porte
-- l'id de l'équipe, vérifié contre is_team_coach() sans jamais faire
-- confiance à ce qu'envoie le client seul.
insert into storage.buckets (id, name, public)
values ('team-photos', 'team-photos', true)
on conflict (id) do nothing;

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
where id = 'team-photos';

create policy "admin or coach manage team photos"
  on storage.objects for all
  using (
    bucket_id = 'team-photos'
    and (public.is_club_admin() or public.is_team_coach(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'team-photos'
    and (public.is_club_admin() or public.is_team_coach(((storage.foldername(name))[1])::uuid))
  );

create policy "public read team photos"
  on storage.objects for select
  using (bucket_id = 'team-photos');
