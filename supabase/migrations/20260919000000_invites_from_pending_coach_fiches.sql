-- Un coach sans compte n'etait rattachable que par son nom.
--
-- Le chargement du fichier "MAILS DES COACHS 2026-2027" a produit deux
-- choses distinctes : des invitations (team_coach_invites, par e-mail) et
-- des rattachements d'attente (team_pending_coaches, par fiche). Les
-- coachs presents dans le fichier avec une adresse ont eu les deux ; ceux
-- rapproches par leur fiche existante n'ont eu que le second — Farid
-- BAHRI, par exemple, est bien coach de U13M-1 mais n'a aucune invitation.
--
-- Consequence : le jour ou il cree son compte, rien ne le promeut. Il
-- resterait "en attente" indefiniment alors qu'il vient de s'inscrire.
--
-- Les deux mecanismes doivent partir de la meme information. On genere
-- donc l'invitation manquante depuis l'adresse de la fiche.
insert into public.team_coach_invites (team_id, email)
select tpc.team_id, p.registration_email
from public.team_pending_coaches tpc
join public.players p on p.id = tpc.player_id
where p.registration_email is not null
  and trim(p.registration_email) <> ''
  -- Une famille partage une seule adresse : si deux fiches portent celle-ci,
  -- rien ne dit laquelle est le coach. On s'abstient plutot que de donner
  -- des droits de coach au mauvais compte.
  and (
    select count(*) from public.players p2
    where p2.registration_email is not null
      and trim(lower(p2.registration_email)) = trim(lower(p.registration_email))
  ) = 1
on conflict (team_id, email) do nothing;
