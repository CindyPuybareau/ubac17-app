-- Trouvé lors de l'audit du 28/08 : même bug déjà corrigé côté joueurs
-- le 21/08 (club_member_names, "je veux voir le nom de la personne sur
-- tous les espaces"), jamais reporté côté bénévoles. event-volunteer-
-- needs.ts résout le nom d'un bénévole inscrit via le client de session
-- de l'appelant ; la seule policy sur benevoles est "admin manage
-- benevoles" (Bureau uniquement) — pour un Coach ou une Famille, la
-- lecture renvoie 0 ligne (refus RLS silencieux) et l'écran affiche
-- "Bénévole" à la place du vrai nom.
--
-- Même traitement que club_member_names : une vue club-wide, prénom/nom
-- seulement (jamais l'email/téléphone/le jeton d'accès de la table
-- benevoles).
create or replace view public.club_benevole_names as
select b.id, b.first_name, b.last_name
from public.benevoles b;

grant select on public.club_benevole_names to authenticated;
