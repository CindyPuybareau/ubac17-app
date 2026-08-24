-- Événements payants créés directement depuis "Créer un événement" (retour
-- de Cindy du 2026-08-25) : une collecte de type EVENEMENT peut désormais
-- être rattachée à un événement du calendrier, avec un lien de paiement
-- externe (HelloAsso...) affiché sur la carte de l'événement — chaque
-- famille concernée paie elle-même depuis sa propre carte, sans envoi
-- groupé à faire à la main.
--
-- on delete set null (pas cascade) sur event_id : si l'événement est
-- supprimé un jour, la collecte et l'historique des paiements déjà
-- enregistrés restent intacts dans "Cotisations -> Événements payants",
-- seulement détachés du calendrier.
alter table public.collectes
  add column if not exists event_id uuid references public.events(id) on delete set null;

-- Nom générique (payment_link) plutôt que "helloasso_link" : la collecte
-- sert déjà aux stages et à la boutique, pas seulement aux événements — le
-- champ pourra resservir un jour pour un autre moyen de paiement en ligne.
-- L'interface, elle, l'affiche bien comme "Lien HelloAsso".
alter table public.collectes
  add column if not exists payment_link text;

create index if not exists collectes_event_id_idx on public.collectes(event_id);
