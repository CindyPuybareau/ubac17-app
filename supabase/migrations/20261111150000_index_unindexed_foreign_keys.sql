-- Audit du 11/11 (conseiller performance Supabase, "unindexed_foreign_keys") :
-- 4 clés étrangères sans index couvrant. Ajout purement additif.
create index if not exists event_tasks_task_type_idx on public.event_tasks (task_type);
create index if not exists event_volunteer_signups_commission_group_id_idx on public.event_volunteer_signups (commission_group_id);
create index if not exists featured_highlights_created_by_idx on public.featured_highlights (created_by);
create index if not exists featured_highlights_event_id_idx on public.featured_highlights (event_id);
