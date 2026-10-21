-- Nettoyage de l'abonnement temps réel (audit du 21/10, suite à une
-- question de Cindy sur l'usage des connexions Supabase) :
--
-- 1) whatsapp_group_members / whatsapp_messages n'ont plus aucun
--    lecteur ni écrivain côté appli depuis le retrait de "Groupes
--    WhatsApp" (19/10) -- retirées de la publication temps réel
--    (abonnement mort, jamais utilisé), les données elles-mêmes
--    restent intactes en base (jamais de purge, règle CLAUDE.md).
--
-- 2) inventory_items (onglet Inventaire, 16/10) était déjà écoutée
--    côté appli (WATCHED_TABLES, realtime-sync.tsx) mais n'avait
--    jamais été ajoutée à la publication Supabase -- son temps réel
--    ne fonctionnait donc jamais réellement (fallait recharger la
--    page pour voir le changement d'un autre onglet/rôle). Corrigé.

alter publication supabase_realtime drop table public.whatsapp_group_members;
alter publication supabase_realtime drop table public.whatsapp_messages;
alter publication supabase_realtime add table public.inventory_items;
