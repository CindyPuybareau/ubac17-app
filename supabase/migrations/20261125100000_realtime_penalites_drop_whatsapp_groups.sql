-- Audit complet du 25/11 (Cindy : "corrige le 1 et 2") :
--
-- 1) penalites : écoutée côté appli depuis le 28/10 (WATCHED_TABLES,
--    realtime-sync.tsx -- "dès que le Bureau marque payé, le coach et le
--    joueur/parent doivent le voir") mais jamais ajoutée à la publication
--    Supabase : le temps réel ne s'est donc jamais déclenché, il fallait
--    recharger la page. Même oubli que inventory_items, corrigé le
--    20/11 (20261120000000_realtime_publication_cleanup.sql).
--
-- 2) whatsapp_groups : publiée mais plus écoutée par personne depuis le
--    retrait des "Groupes WhatsApp" (19/10) -- chaque modification était
--    décodée pour rien par Realtime (74 % du temps de la base mesuré ce
--    jour). Retirée de la publication seulement : les données restent
--    intactes en base (jamais de purge, règle CLAUDE.md n°1).
--
-- Rien n'est supprimé ni modifié dans les tables elles-mêmes.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'penalites'
  ) then
    alter publication supabase_realtime add table public.penalites;
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_groups'
  ) then
    alter publication supabase_realtime drop table public.whatsapp_groups;
  end if;
end $$;
