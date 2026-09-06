-- Retour de Cindy du 06/09 ("le bénévole doit pouvoir se mettre présent ou
-- non, et le bureau ou les coachs doivent avoir la vision des bénévoles
-- qui ont répondu présent") : jusqu'ici une invitation n'était qu'une
-- ligne binaire (invité ou pas), sans réponse possible -- comme pour un
-- joueur (table rsvps), mais ici la réponse vit directement sur
-- l'invitation plutôt que dans une table à part, une invitation de
-- bénévole n'ayant de sens qu'accompagnée de sa réponse.
alter table public.event_benevole_invites
  add column status text not null default 'PENDING'
  check (status in ('PENDING', 'PRESENT', 'ABSENT'));
