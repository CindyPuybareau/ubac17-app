-- Retour de Cindy du 06/09 ("lors de la modification d'un événement je ne
-- peux pas ajouter de bénévoles... pour tous ceux qui peuvent modifier un
-- événement ou en créer un : bureau et coach") : jusqu'ici seul le Bureau
-- pouvait inviter un bénévole (is_club_admin()) -- étendu au coach sur SES
-- PROPRES événements, même principe déjà en place pour les besoins en
-- bénévoles (20261015000000_coach_manage_volunteer_needs.sql). Un coach
-- garde le droit de choisir PARMI les bénévoles du club (lecture sur
-- benevoles ci-dessous), jamais celui d'en créer/modifier/supprimer un --
-- ça reste réservé à "admin manage benevoles" (benevoles-manager.tsx).

drop policy if exists "admin manage event benevole invites" on public.event_benevole_invites;
create policy "admin or coach manage event benevole invites"
  on public.event_benevole_invites for all
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_benevole_invites.event_id and public.is_team_coach(e.team_id)
    )
  )
  with check (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_benevole_invites.event_id and public.is_team_coach(e.team_id)
    )
  );

-- Lecture seule : un coach doit voir la liste des bénévoles du club pour
-- pouvoir en choisir un dans create-event-form.tsx -- la policy "admin
-- manage benevoles" existante (create/modifier/supprimer) reste, elle,
-- strictement réservée au Bureau.
create policy "coach select benevoles"
  on public.benevoles for select
  using (public.is_any_coach());
