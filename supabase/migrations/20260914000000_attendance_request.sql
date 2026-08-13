-- Demande de présences : le coach signale qu'il attend les réponses des
-- familles sur un événement. Les espaces Parent/Joueur affichent alors un
-- bandeau tant que la réponse manque.
--
-- Une simple date sur l'événement plutôt qu'une table dédiée : la demande
-- porte sur l'événement entier, il n'y en a qu'une à la fois, et la date
-- suffit à dire "demandé, le tant". Une table n'apporterait qu'un
-- historique dont personne n'a besoin.
--
-- Strictement additif, nullable : les événements existants restent sans
-- demande, ce qui est leur état correct.
--
-- Pas de policy à ajouter : écrire ici, c'est mettre à jour l'événement,
-- que les coachs de l'équipe et le Bureau peuvent déjà faire.

alter table public.events
  add column if not exists attendance_requested_at timestamptz;

comment on column public.events.attendance_requested_at is
  'Date a laquelle le coach a demande aux familles de repondre. Null = pas de demande.';
