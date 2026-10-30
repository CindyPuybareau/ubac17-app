-- Retour du comptable de Cindy (30/10) : un 3e mode de règlement arrive
-- parfois (chèque, virement...), pas prévu par card_amount/cash_amount
-- (buvette_entries, 20261120040000_buvette_entries.sql) -- additive, les
-- entrées existantes valent 0 par défaut, rien à migrer.
alter table public.buvette_entries add column if not exists other_amount numeric not null default 0;
