-- Suite de 20261030030000 (retour de Cindy du 30/08) : Farid BAHRI et Jean
-- BOUYER-POINOT sont des coachs "en attente" (nommés sur leur fiche Membre
-- via team_pending_coaches, jamais connectés pour créer un compte) — pas
-- couverts par family_coach_contact, qui ne concerne que les coachs déjà
-- liés à un compte (team_coaches/profiles). Côté Bureau (team-card.tsx),
-- leur téléphone/e-mail vient directement de leur fiche Membre puisqu'ils
-- n'ont pas d'autre source possible ; côté Famille, la requête ne
-- demandait même pas ces colonnes, donc "—" garanti.
--
-- Même principe que family_coach_contact : vue dédiée, n'expose que
-- téléphone/e-mail (jamais le reste de la fiche), visible par le Bureau et
-- par tout parent/joueur d'une équipe où ce coach est nommé.
create or replace view public.family_pending_coach_contact as
select
  pl.id as player_id,
  coalesce(pl.registration_phone, pl.mother_phone, pl.father_phone) as phone,
  coalesce(pl.registration_email, pl.secondary_email) as email
from public.players pl
where
  public.is_club_admin()
  or public.is_own_player(pl.id)
  or exists (
    select 1
    from public.team_pending_coaches tpc
    join public.team_players tp on tp.team_id = tpc.team_id
    where
      tpc.player_id = pl.id
      and (
        public.is_own_player(tp.player_id)
        or public.is_teammate_of_my_child(tp.player_id)
        or public.player_on_own_team(tp.player_id)
      )
  );

grant select on public.family_pending_coach_contact to authenticated;
