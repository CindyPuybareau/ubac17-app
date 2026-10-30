-- Retour de Cindy du 30/10 ("un créneau annulé, comité des fêtes") :
-- aucun moyen aujourd'hui de marquer un événement "annulé" avec un motif
-- -- seule option jusqu'ici, le supprimer purement et simplement (perte
-- de toute trace). `cancelled_at` sert de marqueur (null = actif) et
-- double de date d'annulation ; `cancelled_reason` reste nul tant que
-- l'événement n'est pas annulé.
alter table public.events add column if not exists cancelled_at timestamptz;
alter table public.events add column if not exists cancelled_reason text;
