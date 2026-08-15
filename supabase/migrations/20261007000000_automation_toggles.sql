-- Étend l'interrupteur du 20261006000000 (relance cotisation) à *tous* les
-- envois automatiques du club : rien ne doit partir tout seul tant que le
-- Bureau ne l'a pas explicitement activé depuis l'appli (onglet Accueil).
-- Défaut à false sur les deux, comme cotisation_relance_enabled — y
-- compris pour match_reminder_enabled bien que ce rappel tournait déjà en
-- production : Cindy a demandé un contrôle explicite pour absolument tout,
-- donc mieux vaut qu'elle le réactive elle-même en connaissance de cause
-- plutôt que de le laisser filer silencieusement.
alter table public.club_settings
  add column if not exists match_reminder_enabled boolean not null default false,
  add column if not exists expiry_alert_enabled boolean not null default false;
