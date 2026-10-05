-- Retour de Cindy du 05/10 ("il faut revoir les requêtes") : audit du matin
-- (add_missing_foreign_key_indexes) avait traité 12 FK non indexées, 17
-- restaient -- dont rsvps.player_id, directement sur la table qui montre
-- des SELECT à 10-13s dans les logs en ce moment. Les deux FK restantes
-- (event_tasks.task_type, event_volunteer_signups.commission_group_id)
-- pointent vers de petites tables de référence, laissées de côté comme ce
-- matin (même jugement, gain négligeable).
create index if not exists idx_rsvps_player_id on public.rsvps (player_id);
create index if not exists idx_event_carpool_offers_player_id on public.event_carpool_offers (player_id);
create index if not exists idx_event_carpool_reservations_player_id on public.event_carpool_reservations (player_id);
create index if not exists idx_event_volunteer_signups_player_id on public.event_volunteer_signups (player_id);
create index if not exists idx_event_volunteer_signups_benevole_id on public.event_volunteer_signups (benevole_id);
create index if not exists idx_event_benevole_invites_benevole_id on public.event_benevole_invites (benevole_id);
create index if not exists idx_notification_reads_benevole_id on public.notification_reads (benevole_id);
create index if not exists idx_notification_reads_profile_id on public.notification_reads (profile_id);
create index if not exists idx_notification_reads_player_id on public.notification_reads (player_id);
create index if not exists idx_push_subscriptions_profile_id on public.push_subscriptions (profile_id);
create index if not exists idx_team_pending_coaches_player_id on public.team_pending_coaches (player_id);
create index if not exists idx_whatsapp_group_members_player_id on public.whatsapp_group_members (player_id);
create index if not exists idx_whatsapp_messages_created_by on public.whatsapp_messages (created_by);
create index if not exists idx_club_reports_created_by on public.club_reports (created_by);
create index if not exists idx_benevole_whatsapp_groups_whatsapp_group_id on public.benevole_whatsapp_groups (whatsapp_group_id);
