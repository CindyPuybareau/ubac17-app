-- Motif d'absence facultatif, saisi par la famille au moment où elle
-- répond "Absent" depuis l'espace Parent.
--
-- Strictement additif : la colonne est nullable, aucune réponse existante
-- n'est modifiée, et une absence sans motif reste parfaitement valable.
-- Les policies RLS de rsvps (insert/update own rsvps) couvrent déjà cette
-- colonne : les droits portent sur la ligne, pas sur chaque champ.

alter table public.rsvps
  add column if not exists reason text;

comment on column public.rsvps.reason is
  'Motif d''absence saisi par la famille. Facultatif, null si non precise.';
