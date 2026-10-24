-- Retour de Cindy du 24/10 ("le bureau effectue souvent leur comptes
-- rendus sur un document word... pour que tout soit centralisé") :
-- Mairies/Bureau/Coachs peuvent désormais aussi déposer un vrai fichier
-- (comme CD17/Ligue, voir 20260901030000), en plus d'écrire un texte dans
-- l'appli -- les deux restent possibles, jamais fusionnés. file_path est
-- déjà une colonne générique sur club_reports (ajoutée avec CD17_LIGUE
-- mais jamais restreinte à cette seule catégorie par le CHECK), et la
-- policy "insert club_reports" (20260901010000) n'a jamais empêché d'y
-- écrire file_path pour ces 3 catégories -- seul le bucket Storage
-- bloquait, c'est la seule chose à corriger ici.

-- Word en plus du PDF/JPEG/PNG déjà acceptés -- bucket partagé par les 4
-- catégories, élargir profite aussi à CD17/Ligue (cohérent, pas gênant).
update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'club-report-files';

-- Dépôt : Bureau (Mairies/Bureau) ou n'importe quel coach (ses propres
-- comptes rendus) -- policy séparée des deux déjà existantes pour
-- CD17/Ligue ("admin upload/delete cd17 ligue files"), jamais touchées,
-- CD17/Ligue reste Bureau seul pour toujours. Storage ne connaît pas la
-- catégorie de la ligne club_reports (le fichier est déposé AVANT la
-- ligne) -- comme pour les autres buckets similaires de ce projet
-- (team-trombinoscopes, sponsor-logos...), la vraie frontière de droits
-- est la policy sur club_reports elle-même (déjà correcte par
-- catégorie/auteur) ; ce contrôle Storage reste volontairement large
-- (Bureau + tout coach), cohérent avec la policy de LECTURE déjà en
-- place sur ce même bucket (20260901030000, déjà "admin ou tout coach"
-- pour TOUT le bucket, pas seulement CD17).
create policy "admin or coach upload club report files"
  on storage.objects for insert
  with check (
    bucket_id = 'club-report-files'
    and (public.is_club_admin() or public.is_any_coach())
  );

-- Suppression : même repli (pas de lien entre un fichier Storage et sa
-- ligne club_reports pour restreindre plus finement) -- la ligne
-- club_reports, elle, reste bloquée par sa propre policy DELETE (déjà
-- "soi-même ou Bureau" pour COACH, "Bureau" pour MAIRIE/BUREAU).
create policy "admin or coach delete club report files"
  on storage.objects for delete
  using (
    bucket_id = 'club-report-files'
    and (public.is_club_admin() or public.is_any_coach())
  );
