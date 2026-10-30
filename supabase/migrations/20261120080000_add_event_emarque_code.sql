-- Retour du comptable de Cindy (30/10) : code e-Marque à noter pour chaque
-- match officiel à domicile -- additive, nulle pour tous les événements
-- existants (jamais renseigné pour un entraînement/amical/extérieur).
alter table public.events add column if not exists emarque_code text;
