-- Retour de Cindy du 30/08 : un coach peut aujourd'hui modifier N'IMPORTE
-- QUEL champ d'un joueur qu'il gère (notes médicales, numéro de licence,
-- statut FBI...), pas seulement ses coordonnées — signalé "à valider côté
-- club" dès la policy d'origine (20260909000000_coach_update_own_roster.sql),
-- jamais tranché jusqu'ici. Décision : restreindre aux coordonnées.
--
-- La RLS filtre des LIGNES, jamais des colonnes : un simple revoke de
-- colonne ne marche pas ici, puisque `authenticated` couvre AUSSI le
-- Bureau et le joueur/ses parents, qui doivent garder un accès complet à
-- leur propre fiche. Un déclencheur BEFORE UPDATE, qui ne s'applique QUE
-- lorsqu'aucune permission plus large ne s'applique déjà (ni Bureau, ni le
-- joueur lui-même, ni un de ses parents), est le seul moyen de distinguer
-- "c'est justement le coach qui écrit via sa policy à lui" du reste.
--
-- Liste blanche plutôt que liste noire : seules les coordonnées de contact
-- peuvent changer sous ce chemin ; toute autre colonne (nom, catégorie,
-- licence, notes médicales, statut FBI...) est bloquée, y compris une
-- future colonne qui n'existe pas encore.
create or replace function public.restrict_coach_player_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Bureau, le joueur lui-même, ou un de ses parents : accès complet,
  -- rien à restreindre ici.
  if public.is_club_admin()
    or public.is_own_player(old.id)
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = old.id and pp.parent_id = auth.uid()
    )
  then
    return new;
  end if;

  -- Reste : seule la policy "coach update roster of own teams" a pu
  -- laisser passer cette écriture. Coordonnées de contact autorisées,
  -- tout le reste doit rester identique à avant l'écriture.
  if new.first_name is distinct from old.first_name
    or new.last_name is distinct from old.last_name
    or new.profile_id is distinct from old.profile_id
    or new.pending_parent_email is distinct from old.pending_parent_email
    or new.birth_date is distinct from old.birth_date
    or new.category is distinct from old.category
    or new.sex is distinct from old.sex
    or new.license_type is distinct from old.license_type
    or new.membership_type is distinct from old.membership_type
    or new.fbi_status is distinct from old.fbi_status
    or new.medical_notes is distinct from old.medical_notes
    or new.other_notes is distinct from old.other_notes
    or new.image_rights is distinct from old.image_rights
    or new.player_charter_accepted is distinct from old.player_charter_accepted
    or new.parent_charter_accepted is distinct from old.parent_charter_accepted
    or new.license_number is distinct from old.license_number
    or new.license_expires_at is distinct from old.license_expires_at
    or new.medical_certificate_expires_at is distinct from old.medical_certificate_expires_at
    or new.archived_at is distinct from old.archived_at
    or new.last_child_login_at is distinct from old.last_child_login_at
  then
    raise exception 'Un coach ne peut modifier que les coordonnées de contact de ses joueurs.';
  end if;

  return new;
end;
$$;

drop trigger if exists restrict_coach_player_update_trigger on public.players;
create trigger restrict_coach_player_update_trigger
  before update on public.players
  for each row
  execute function public.restrict_coach_player_update();
