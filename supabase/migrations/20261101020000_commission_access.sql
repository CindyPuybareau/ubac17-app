-- "Accès Commissions & Administration" (retour de Cindy du 10/09) :
-- remplace la gestion d'accès personne par personne (benevoles-manager.tsx)
-- par une gestion au niveau de chaque commission -- réutilise exactement
-- les commissions déjà listées dans whatsapp_groups (category='COMMISSION',
-- voir whatsapp-groups-manager.tsx) plutôt que d'inventer une nouvelle liste.

-- Lien public permanent (même principe que benevoles.access_token, voir
-- 20261027000000_benevoles.sql) + profil d'accès en lecture seule (même
-- principe que benevoles.access_profile_id, voir
-- 20261031150000_benevoles_access_profile.sql), mais porté par la
-- commission elle-même : toute personne utilisant ce lien en bénéficie,
-- sans configuration individuelle.
alter table public.whatsapp_groups
  add column if not exists access_token text unique default encode(gen_random_bytes(24), 'hex'::text),
  add column if not exists access_profile_id uuid references public.access_profiles(id) on delete set null;

-- Chaque commission existante reçoit son lien tout de suite (le lien
-- "permanent" doit exister dès la migration, pas seulement à la prochaine
-- édition depuis l'écran) -- les groupes EQUIPE n'en ont pas besoin.
update public.whatsapp_groups
set access_token = encode(gen_random_bytes(24), 'hex'::text)
where category = 'COMMISSION' and access_token is null;

-- Migration des données existantes (retour de Cindy : "rattachés
-- automatiquement... plutôt que supprimés sans transfert d'information") :
-- benevole_whatsapp_groups relie déjà chaque bénévole individuel à sa
-- commission -- rien à recréer côté rattachement. Seul l'ACCÈS (les
-- briques cochées sur la fiche individuelle) doit être repris comme point
-- de départ pour la commission : best-effort, un seul bénévole ayant
-- configuré un profil sur-mesure pour une commission qui n'en a pas encore
-- suffit à lui donner ce même profil de départ (le Bureau ajuste ensuite
-- depuis le nouvel écran si plusieurs bénévoles d'une même commission
-- avaient des accès différents).
update public.whatsapp_groups wg
set access_profile_id = sub.access_profile_id
from (
  select distinct on (bwg.whatsapp_group_id)
    bwg.whatsapp_group_id, b.access_profile_id
  from public.benevole_whatsapp_groups bwg
  join public.benevoles b on b.id = bwg.benevole_id
  where b.access_profile_id is not null and b.archived_at is null
  order by bwg.whatsapp_group_id, b.access_profile_id
) sub
where wg.id = sub.whatsapp_group_id
  and wg.category = 'COMMISSION'
  and wg.access_profile_id is null;

-- Quelle commission un besoin en bénévoles (event_volunteer_needs) concerne
-- -- nullable : un besoin peut rester sans commission (comportement
-- historique inchangé), le champ n'est qu'un lien optionnel en plus.
alter table public.event_volunteer_needs
  add column if not exists commission_group_id uuid references public.whatsapp_groups(id) on delete set null;

-- Troisième forme de signataire d'un besoin (event_volunteer_signups),
-- en plus de player_id/benevole_id : un·e "invité·e" du lien commun d'une
-- commission, sans identité permanente -- juste un prénom saisi au moment
-- de cliquer "Je me propose" (retour de Cindy : le lien est partagé par
-- toute une commission, pas propre à une personne comme un lien bénévole).
alter table public.event_volunteer_signups
  add column if not exists commission_group_id uuid references public.whatsapp_groups(id) on delete cascade,
  add column if not exists guest_name text;

alter table public.event_volunteer_signups
  drop constraint if exists event_volunteer_signups_signer_check;
alter table public.event_volunteer_signups
  add constraint event_volunteer_signups_signer_check
  check (
    (case when player_id is not null then 1 else 0 end
     + case when benevole_id is not null then 1 else 0 end
     + case when commission_group_id is not null then 1 else 0 end) = 1
  );
alter table public.event_volunteer_signups
  add constraint event_volunteer_signups_guest_name_check
  check (commission_group_id is null or guest_name is not null);

-- Empêche le même prénom de doublonner sur le même besoin depuis le même
-- lien de commission (double-clic, deux onglets) sans empêcher plusieurs
-- personnes différentes de la même commission de se proposer.
create unique index if not exists event_volunteer_signups_need_commission_guest_key
  on public.event_volunteer_signups (need_id, commission_group_id, lower(guest_name))
  where commission_group_id is not null;

-- Pas de nouvelle policy RLS : la lecture du lien passe par service_role
-- (comme /benevole/[token]/route.ts), l'admin manage whatsapp groups"
-- existante couvre déjà l'édition d'access_token/access_profile_id par le
-- Bureau, et l'écriture d'un signup "invité" passe par une route API
-- dédiée (service_role également), jamais un accès direct depuis le
-- navigateur.
