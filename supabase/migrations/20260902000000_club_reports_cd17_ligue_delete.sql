-- Retour de Cindy du 2026-09-02 : le verrouillage total (ni modification ni
-- suppression, meme pour le Bureau) etait trop strict a l'usage -- en cas
-- d'erreur de depot (mauvais fichier, doublon...), le Bureau doit pouvoir
-- retirer le document. Le contenu lui-meme reste non modifiable/non
-- remplacable (aucune policy UPDATE ajoutee ici, volontairement) : on
-- supprime et on redepose, on ne "corrige" jamais un CD17/Ligue en place.
create policy "delete cd17 ligue reports"
  on public.club_reports for delete
  using (category = 'CD17_LIGUE' and public.is_club_admin());

create policy "admin delete cd17 ligue files"
  on storage.objects for delete
  using (bucket_id = 'club-report-files' and public.is_club_admin());
