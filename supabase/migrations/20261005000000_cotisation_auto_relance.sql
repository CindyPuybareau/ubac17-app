-- Relance automatique des cotisations impayées : contrairement à un
-- match ou une échéance de licence, une cotisation "en attente" n'a pas
-- de date propre à surveiller — juste un statut qui reste vrai tant que
-- rien n'est réglé. Le repère est donc un cooldown (pas de date cible) :
-- ne jamais relancer plus souvent que tous les 14 jours (voir
-- COOLDOWN_DAYS dans /api/cron/bureau-alerts), remis à zéro par le
-- prochain envoi automatique lui-même, pas par une action du Bureau —
-- au contraire de license_expiry_alert_sent_at, il n'y a rien à
-- "corriger" ici qui justifierait une remise à NULL manuelle.
alter table public.cotisations
  add column if not exists last_auto_relance_sent_at timestamptz;
