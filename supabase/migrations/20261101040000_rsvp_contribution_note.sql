-- "Ce que j'apporte" (retour de Cindy du 10/09) : commentaire libre et
-- facultatif, saisi par le membre au moment où il répond "Présent" à un
-- événement qui a au moins un besoin d'organisation (event_volunteer_needs)
-- -- ex. "Je fais la pâte à crêpes", "J'apporte les gobelets". Rattaché à
-- la réponse de présence (rsvps), pas au besoin lui-même : être présent
-- n'implique pas d'être inscrit à un besoin précis.
--
-- Même principe que rsvps.reason (motif d'absence, migration du 13/09) :
-- strictement additif, nullable, RLS déjà couvert par les policies
-- existantes sur rsvps (les droits portent sur la ligne, pas sur chaque
-- champ). Volontairement une colonne séparée plutôt qu'une réutilisation
-- de "reason" : deux sens différents (pourquoi absent / qu'est-ce
-- qu'on apporte en étant présent) sur la même colonne aurait été trompeur.
--
-- Changer de statut ne l'efface jamais (retour de Cindy : "conservée mais
-- masquée") -- l'app ne l'affiche/ne la ressaisit simplement plus tant que
-- le statut n'est pas PRESENT, voir attendance-badges.tsx/rsvp-buttons.tsx/
-- rsvp-control.tsx.

alter table public.rsvps
  add column if not exists contribution_note text;

alter table public.rsvps
  drop constraint if exists rsvps_contribution_note_length;
alter table public.rsvps
  add constraint rsvps_contribution_note_length
  check (char_length(contribution_note) <= 120);

comment on column public.rsvps.contribution_note is
  'Ce que le membre apporte/prend en charge en étant présent (facultatif, 120 caractères max, null si non précisé). Conservé même si le statut repasse à ABSENT, simplement masqué à l''affichage.';
