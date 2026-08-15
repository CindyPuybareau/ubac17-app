-- Marque un événement comme déjà "rappelé la veille" (voir la route cron
-- /api/cron/match-reminders) : évite un double envoi si le job est
-- relancé (retry Vercel, redéploiement le même jour...). Pas de RLS/grant
-- supplémentaire nécessaire — seule la route cron y écrit, via la clé
-- service_role qui contourne déjà la RLS.
alter table public.events
  add column if not exists reminder_sent_at timestamptz;
