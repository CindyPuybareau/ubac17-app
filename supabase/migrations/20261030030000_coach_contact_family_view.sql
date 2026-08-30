-- Retour de Cindy du 30/08 : le téléphone/e-mail d'un coach saisis dans sa
-- fiche Membre (registration_phone/registration_email, remplis par le
-- Bureau) n'apparaissaient pas côté Famille pour un coach qui n'a jamais
-- rempli son propre compte de connexion (Farid BAHRI, Jean BOUYER-POINOT :
-- tirets côté Famille alors que la fiche est correcte côté Bureau).
--
-- Cause : côté Bureau, team-card.tsx (contactsFor) lit d'abord la fiche
-- Membre puis, en repli seulement, le compte lié — côté Famille,
-- coachesByTeamId (page.tsx) ne lisait QUE le compte lié (profiles.phone/
-- email) via l'embed team_coaches -> profiles, jamais la fiche. Deux
-- calculs séparés pour la même information, exactement la même classe de
-- bug que celui des présences corrigé plus tôt le 30/08 (mêmes espaces qui
-- divergent faute de logique partagée).
--
-- Vue dédiée plutôt qu'une policy RLS plus large sur players (même
-- raisonnement que family_teammate_roster/sponsor_display) : n'expose que
-- le téléphone et l'e-mail déjà calculés avec la même priorité que
-- team-card.tsx, jamais le reste de la fiche (adresse, notes médicales...).
-- Visible par : le Bureau, le coach lui-même, et tout parent/joueur d'une
-- équipe que ce coach encadre (même public que family_teammate_roster,
-- côté coach plutôt que côté coéquipier).
create or replace view public.family_coach_contact as
select
  p.id as profile_id,
  coalesce(pl.registration_phone, p.phone, pl.mother_phone, pl.father_phone) as phone,
  coalesce(pl.registration_email, p.email, pl.secondary_email) as email
from public.profiles p
left join public.players pl on pl.profile_id = p.id
where
  public.is_club_admin()
  or p.id = auth.uid()
  or exists (
    select 1
    from public.team_coaches tc
    join public.team_players tp on tp.team_id = tc.team_id
    where
      tc.coach_id = p.id
      and (
        public.is_own_player(tp.player_id)
        or public.is_teammate_of_my_child(tp.player_id)
        or public.player_on_own_team(tp.player_id)
      )
  );

grant select on public.family_coach_contact to authenticated;
