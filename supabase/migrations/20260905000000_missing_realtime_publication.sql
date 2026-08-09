-- Deux tables figuraient dans WATCHED_TABLES (realtime-sync.tsx) sans être
-- publiées côté Postgres : leurs changements n'étaient donc jamais émis, et
-- le router.refresh() du "360°" ne partait pas.
--
--   players             — 20260807000000_players_realtime.sql n'a jamais été
--                         appliquée sur le projet ; l'ajout d'un membre côté
--                         Bureau restait invisible côté Coach sans F5.
--   cotisation_payments — ajoutée à WATCHED_TABLES avec la fonctionnalité
--                         multi-paiement, sans la migration correspondante.
--
-- Idempotent : rejouer ce bloc ne fait rien si les tables sont déjà publiées
-- (alter publication ... add table échoue sur une table déjà présente).
do $$
declare
  t text;
begin
  foreach t in array array['players', 'cotisation_payments']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
