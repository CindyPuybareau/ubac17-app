-- Retour de Cindy du 28/10 ("phase 1 -> phase 2 pour U18 à U9") : les
-- catégories jeunes rejouent en milieu de saison dans une nouvelle poule
-- (reclassement), avec un NOUVEAU lien FFBB -- jamais visible sur le site
-- FFBB avant que la phase 1 soit terminée. Décisions validées avec Cindy :
-- la phase 1 (classement + matchs déjà enregistrés) reste gelée pour
-- toujours dès que la phase 2 démarre pour une équipe, plus jamais relue
-- sur le site FFBB ; les Séniors (une seule phase cette saison) ne sont
-- pas concernés et ne changent pas de comportement.

-- `team_rankings` existe déjà en production (créée directement contre le
-- projet distant, jamais passée par une migration du dépôt -- trouvé en
-- préparant ce chantier) : recréée ici à l'identique pour que l'historique
-- de migrations du dépôt redevienne fidèle à ce qui tourne réellement,
-- sans aucun effet sur les données déjà là (IF NOT EXISTS partout).
create table if not exists public.team_rankings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  sort_order integer not null,
  "position" text not null,
  label text not null,
  points text not null,
  previous_ranking integer,
  is_own_team boolean not null default false,
  logo text,
  synced_at timestamptz not null default now()
);

create index if not exists team_rankings_team_id_idx
  on public.team_rankings (team_id, sort_order);

alter table public.team_rankings enable row level security;

-- drop + create (pas de "if not exists" pour une policy en Postgres) :
-- sans effet sur les lignes déjà là, juste la policy elle-même redéfinie
-- à l'identique si elle existait déjà.
drop policy if exists "select team_rankings club wide" on public.team_rankings;
create policy "select team_rankings club wide"
  on public.team_rankings
  for select
  using (true);

grant select on public.team_rankings to authenticated;

-- Lien FFBB de la phase 2, à côté de ffbb_url (qui reste la phase 1,
-- jamais renommée pour ne rien casser côté lecture existante -- "Voir sur
-- FFBB" sur le calendrier, scripts/sync-ffbb-all.ts). Vide pour toute
-- équipe qui n'a qu'une seule phase cette saison (Séniors 1/2, et tant
-- qu'une catégorie jeune n'a pas encore basculé) -- rien ne change pour
-- elles tant que ce champ reste vide.
alter table public.teams add column if not exists ffbb_url_phase2 text;

-- Étiquette posée par la synchro (scripts/sync-ffbb-all.ts) sur chaque
-- ligne de classement ET chaque match importé, pour savoir laquelle vient
-- de quelle phase. NULL (toutes les lignes déjà enregistrées avant ce
-- chantier) veut dire "phase 1" -- jamais besoin de les retoucher, lu
-- comme tel côté application (coalesce(ffbb_phase, 1)). smallint plutôt
-- que text : 1/2/3 au fil des saisons futures (phase 2-2 à venir), aucune
-- équipe ne joue dans plus d'une poignée de phases.
alter table public.team_rankings add column if not exists ffbb_phase smallint;
alter table public.events add column if not exists ffbb_phase smallint;
