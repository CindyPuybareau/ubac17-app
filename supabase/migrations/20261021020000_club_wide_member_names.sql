-- Retour de Cindy du 2026-08-21 : "je veux voir apparaitre le nom et
-- prénom de la personne, sur tout les espaces" — capture d'écran de son
-- espace Parent montrant "Bénévole" à la place d'un vrai nom sur "Lavage
-- maillots". Cause : teammate_names (posée le 2026-08-20) ne montre le
-- prénom/nom d'un membre qu'à ses coéquipiers (même équipe qu'un de ses
-- enfants, ou lui-même) — la personne inscrite ici n'est dans aucune
-- équipe commune avec elle, donc hors de cette portée, d'où le repli
-- générique "Bénévole".
--
-- Élargi à tout le club plutôt que scopé "peut voir cet événement
-- précis" : plus simple, et cohérent avec un petit club où tout le monde
-- se connaît déjà. Toujours seulement prénom/nom (jamais téléphone,
-- adresse, notes médicales — la vue ne les a jamais exposés).
--
-- Renommée club_member_names : "teammate" ne décrit plus la portée
-- réelle, autant éviter qu'un futur "pourquoi ce nom" reparte sur une
-- fausse piste.
drop view if exists public.teammate_names;

create or replace view public.club_member_names as
select p.id, p.first_name, p.last_name
from public.players p;

grant select on public.club_member_names to authenticated;
