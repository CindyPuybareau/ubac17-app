-- Correction (retour de Cindy du 2026-09-01, "ce n'est pas ce que j'ai
-- demande") : les comptes rendus COACH doivent etre visibles par le Bureau
-- ET TOUS les coachs (transparence entre equipes), pas seulement par leur
-- auteur -- la premiere version de cette policy (20260901010000) les
-- restreignait a tort a created_by = auth.uid() seul. L'ECRITURE reste
-- elle inchangee : seul l'auteur (ou le Bureau) peut modifier/supprimer un
-- compte rendu coach donne -- voir la policy "update club reports"/
-- "delete club reports", non touchees ici.
drop policy if exists "read club reports" on public.club_reports;
create policy "read club reports"
  on public.club_reports for select
  using (
    public.is_club_admin()
    or (category in ('MAIRIE', 'BUREAU', 'COACH', 'CD17_LIGUE') and public.is_any_coach())
  );

-- Nécessaire pour afficher "qui a écrit quoi" sur la liste partagée des
-- comptes rendus COACH (dashboard/page.tsx) : la policy existante
-- "coach select co-coach profiles" (20260731010000) ne permet de voir le
-- profil d'un autre coach que s'il coache la MÊME équipe que soi -- trop
-- étroit ici, où deux coachs d'équipes différentes doivent pouvoir se voir
-- nommément. Portée volontairement restreinte : uniquement les profils de
-- personnes qui coachent au moins une équipe (jamais un parent/joueur au
-- hasard), et seulement pour un viewer qui est lui-même coach.
create policy "coach select any coach profile"
  on public.profiles for select
  using (
    public.is_any_coach()
    and exists (
      select 1 from public.team_coaches tc where tc.coach_id = profiles.id
    )
  );
