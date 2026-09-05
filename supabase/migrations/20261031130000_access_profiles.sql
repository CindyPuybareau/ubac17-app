-- Nouveau système de profils d'accès sur-mesure (retour de Cindy du 05/09,
-- reprise du sujet mis en pause le 02/09 avec une portée plus large :
-- profils nommés, briques cochées une par une, plutôt qu'un simple
-- binaire "Bureau/Commission" comme dans l'esquisse du 02/09
-- (20261031080000_commission_access_level.sql, jamais appliquée, restée
-- dans un stash git). Étape 1 : uniquement la structure -- aucune règle de
-- sécurité ne change ici, personne n'a encore de profil assigné
-- (access_profile_id reste NULL pour tout le monde = "Bureau complet",
-- exactement comme aujourd'hui).

create table public.access_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- Liste blanche volontaire des briques disponibles : Paiements et
-- "attribuer un accès" n'y figurent jamais, par choix -- impossible de les
-- cocher pour un profil sur-mesure, quoi qu'il arrive. Les comptes rendus
-- sont détaillés par catégorie (Bureau/Mairies/Coachs) plutôt qu'un bloc
-- unique, pour permettre le vrai "sur-mesure" demandé.
create table public.access_profile_briques (
  profile_id uuid not null references public.access_profiles(id) on delete cascade,
  brique text not null check (brique in (
    'membres',
    'equipes',
    'cotisations',
    'sponsors',
    'benevoles',
    'penalites',
    'compte_rendu_bureau',
    'compte_rendu_mairies',
    'compte_rendu_coachs'
  )),
  primary key (profile_id, brique)
);

-- NULL = Bureau complet (comportement actuel, inchangé) ; sinon, l'accès
-- se limite aux briques cochées pour ce profil précis.
alter table public.club_administrators
  add column access_profile_id uuid references public.access_profiles(id) on delete set null;
