-- Retour de Cindy du 29/08 : pouvoir attacher un lien de paiement
-- (HelloAsso) à une pénalité précise, pour que le joueur/parent concerné
-- puisse payer directement depuis son espace — même principe que
-- collectes.payment_link pour les cotisations, mais saisi au cas par cas
-- ici (pas de collecte générique, chaque pénalité a son propre montant).
alter table public.penalites add column if not exists payment_link text;
