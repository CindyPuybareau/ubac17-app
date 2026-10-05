-- Retour de Cindy du 05/10 ("trombinoscope, un par équipe mère, les
-- coachs en ont besoin pour chaque match officiel") : un PDF par équipe
-- mère (U13M, U18M, Séniors M...), consulté par ses déclinaisons
-- (U13M-1/U13M-2 etc. n'ont pas leur propre colonne -- l'application
-- résout la bonne équipe mère via getTrombinoscopeTeamId, src/lib/teams.ts).

alter table public.teams add column if not exists trombinoscope_path text;

-- Privé (contrairement à team-photos, public) : un trombinoscope liste
-- noms + photos de TOUS les joueurs d'une équipe, pas juste une photo de
-- groupe -- accès restreint aux comptes club (Bureau/coachs), jamais une
-- URL publique sur l'internet ouvert. Les lectures passent par une URL
-- signée générée à la demande (voir trombinoscope-button.tsx).
insert into storage.buckets (id, name, public)
values ('team-trombinoscopes', 'team-trombinoscopes', false)
on conflict (id) do nothing;

update storage.buckets
set
  file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf']
where id = 'team-trombinoscopes';

-- Écriture : Bureau ou coach de L'ÉQUIPE MÈRE précisément (le chemin est
-- toujours "<motherTeamId>/trombinoscope.pdf", jamais celui d'une
-- déclinaison) -- storage.foldername(name)[1] porte cet id, vérifié contre
-- is_team_coach() sans jamais faire confiance à ce qu'envoie le client
-- seul. Trois policies séparées (plutôt qu'un seul FOR ALL, qui couvrirait
-- aussi SELECT) pour ne pas dupliquer la policy de lecture ci-dessous,
-- volontairement plus large -- même méthodologie que la consolidation RLS
-- menée plus tôt cette session (jamais deux policies permissives sur la
-- même action).
create policy "admin or mother team coach insert trombinoscope"
  on storage.objects for insert
  with check (
    bucket_id = 'team-trombinoscopes'
    and (public.is_club_admin() or public.is_team_coach(((storage.foldername(name))[1])::uuid))
  );

create policy "admin or mother team coach update trombinoscope"
  on storage.objects for update
  using (
    bucket_id = 'team-trombinoscopes'
    and (public.is_club_admin() or public.is_team_coach(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'team-trombinoscopes'
    and (public.is_club_admin() or public.is_team_coach(((storage.foldername(name))[1])::uuid))
  );

create policy "admin or mother team coach delete trombinoscope"
  on storage.objects for delete
  using (
    bucket_id = 'team-trombinoscopes'
    and (public.is_club_admin() or public.is_team_coach(((storage.foldername(name))[1])::uuid))
  );

-- Lecture : N'IMPORTE QUEL coach du club (confirmé ou en attente, voir
-- is_coach_anywhere), pas seulement celui de l'équipe mère précise -- un
-- coach de U13M-1 doit pouvoir consulter le trombinoscope stocké sous
-- U13M, c'est tout l'intérêt du partage mère/déclinaisons. Les coachs sont
-- déjà mutuellement amenés à se voir les effectifs les uns des autres
-- ailleurs dans l'appli (matchs des équipes sœurs, Bilan de saison) --
-- aucune frontière de confidentialité nouvelle à franchir ici.
create policy "any coach or admin read trombinoscope"
  on storage.objects for select
  using (
    bucket_id = 'team-trombinoscopes'
    and (public.is_club_admin() or public.is_coach_anywhere())
  );
