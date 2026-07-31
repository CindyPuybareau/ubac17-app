-- Adds the club's real training venues (from ubac17.fr's "Légende des
-- lieux") as a dedicated field on events, separate from the free-text
-- location. Purely additive — no existing event_type color/logic touched.
alter table public.events
  add column if not exists salle text
  check (salle in ('Angoulins', 'Châtelaillon', 'Saint-Vivien'));
