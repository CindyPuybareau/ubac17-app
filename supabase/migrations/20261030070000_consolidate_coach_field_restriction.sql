-- Corrige une erreur du 30/08 : la migration précédente
-- (20261030060000_restrict_coach_player_update_to_contact.sql) créait un
-- DEUXIÈME déclencheur BEFORE UPDATE sur players, sans avoir vérifié qu'un
-- premier (protect_sensitive_player_fields, 20261011000000) faisait déjà
-- exactement ce genre de restriction par colonne — pour license_number et
-- medical_notes, réservés au Bureau. Deux déclencheurs BEFORE UPDATE sur la
-- même table peuvent s'exécuter dans un ordre peu lisible et se marcher
-- dessus ; en plus, le nouveau bloquait TOUTE l'écriture avec une erreur
-- brute dès qu'un champ interdit changeait, alors que le mécanisme déjà en
-- place laisse l'écriture passer et se contente d'annuler discrètement le
-- champ interdit (bien meilleure expérience : les coordonnées que le coach
-- voulait vraiment corriger sont quand même enregistrées).
--
-- Un seul déclencheur, deux niveaux de restriction :
--  1. medical_notes / license_number : Bureau uniquement, même pour le
--     joueur ou ses parents (comportement du 2026-10-11, inchangé).
--  2. Tout le reste de la fiche SAUF les coordonnées de contact : Bureau,
--     le joueur lui-même, ou l'un de ses parents — jamais un coach qui
--     n'agit que via "coach update roster of own teams" (retour de Cindy
--     du 30/08, décision prise avec elle le jour même).
drop trigger if exists restrict_coach_player_update_trigger on public.players;
drop function if exists public.restrict_coach_player_update();

create or replace function public.protect_sensitive_player_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_club_admin() then
    new.medical_notes := old.medical_notes;
    new.license_number := old.license_number;
  end if;

  if not (
    public.is_club_admin()
    or public.is_own_player(old.id)
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = old.id and pp.parent_id = auth.uid()
    )
  ) then
    new.first_name := old.first_name;
    new.last_name := old.last_name;
    new.profile_id := old.profile_id;
    new.pending_parent_email := old.pending_parent_email;
    new.birth_date := old.birth_date;
    new.category := old.category;
    new.sex := old.sex;
    new.license_type := old.license_type;
    new.membership_type := old.membership_type;
    new.fbi_status := old.fbi_status;
    new.other_notes := old.other_notes;
    new.image_rights := old.image_rights;
    new.player_charter_accepted := old.player_charter_accepted;
    new.parent_charter_accepted := old.parent_charter_accepted;
    new.license_expires_at := old.license_expires_at;
    new.medical_certificate_expires_at := old.medical_certificate_expires_at;
    new.archived_at := old.archived_at;
    new.last_child_login_at := old.last_child_login_at;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_sensitive_player_fields on public.players;
create trigger protect_sensitive_player_fields
  before update on public.players
  for each row execute function public.protect_sensitive_player_fields();
