-- Comptes rendus CD17/Ligue (retour de Cindy du 2026-09-01) : la 4e
-- categorie de club_reports, deja prevue dans le CHECK constraint
-- (20260901010000) mais jamais construite jusqu'ici, volontairement laissee
-- pour la fin. Contrairement a MAIRIE/BUREAU/COACH (texte redige dans
-- l'appli, sans cout de stockage), un compte rendu CD17/Ligue est un vrai
-- document RECU de l'exterieur (souvent avec l'en-tete officiel de la
-- Ligue) -- on ne peut pas le "retaper", il faut le deposer tel quel.
alter table public.club_reports
  add column if not exists file_path text;

-- Ecriture (creation) : uniquement le Bureau, uniquement pour cette
-- categorie -- policy separee de "insert club reports" (20260901010000)
-- plutot que la modifier, pour ne jamais risquer de rouvrir l'ecriture des
-- coachs sur cette categorie par erreur.
create policy "insert cd17 ligue reports"
  on public.club_reports for insert
  with check (category = 'CD17_LIGUE' and public.is_club_admin());

-- Aucune policy UPDATE/DELETE pour CD17_LIGUE, deliberement : verrouille
-- pour toujours des le depot, meme pour le Bureau (retour explicite de
-- Cindy) -- les policies "update club reports"/"delete club reports"
-- existantes ne couvrent deja que MAIRIE/BUREAU/COACH, donc toute tentative
-- ici est bloquee par defaut, sans rien a ecrire de plus.

-- Bucket prive (jamais public comme sponsor-logos : ce sont des documents
-- internes au club, pas des images destinees au site public) -- lecture
-- via URL signee generee cote serveur (dashboard/page.tsx), jamais un
-- acces direct sans verification des droits.
insert into storage.buckets (id, name, public)
values ('club-report-files', 'club-report-files', false)
on conflict (id) do nothing;

update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'club-report-files';

-- Depot : uniquement le Bureau.
create policy "admin upload cd17 ligue files"
  on storage.objects for insert
  with check (bucket_id = 'club-report-files' and public.is_club_admin());

-- Lecture : Bureau + tous les coachs (meme portee que la ligne club_reports
-- correspondante).
create policy "read cd17 ligue files"
  on storage.objects for select
  using (
    bucket_id = 'club-report-files'
    and (public.is_club_admin() or public.is_any_coach())
  );

-- Aucune policy UPDATE/DELETE sur ces fichiers non plus, deliberement --
-- meme verrouillage permanent que la ligne club_reports qui les reference.
