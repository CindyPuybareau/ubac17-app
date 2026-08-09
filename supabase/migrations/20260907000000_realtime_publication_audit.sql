-- Audit du "360°" : mise à niveau de la publication supabase_realtime.
--
-- Écouter une table côté client (WATCHED_TABLES dans realtime-sync.tsx) ne
-- sert à rien si Postgres ne la publie pas — aucun événement n'est émis et
-- le router.refresh() ne part jamais. Deux catégories de manques :
--
--   1. Déjà écoutées mais jamais publiées sur ce projet :
--      players             — 20260807000000 n'a jamais été appliquée
--      cotisation_payments — ajoutée à WATCHED_TABLES sans sa migration
--
--   2. Écrites par l'app mais qui n'étaient pas écoutées du tout, et qui
--      viennent d'être ajoutées à WATCHED_TABLES :
--      teams, parent_player, profiles, whatsapp_messages, collectes,
--      category_tariffs
--
-- team_coach_invites reste volontairement dehors : aucune vue ne l'affiche,
-- la publier ne ferait que déclencher des rafraîchissements inutiles.
--
-- La RLS continue de filtrer la distribution : chaque rôle ne reçoit que
-- les lignes qu'il a le droit de lire.
do $$
declare
  t text;
begin
  foreach t in array array[
    'players', 'cotisation_payments',
    'teams', 'parent_player', 'profiles', 'whatsapp_messages',
    'collectes', 'category_tariffs'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
