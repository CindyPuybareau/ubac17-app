-- Retour de Cindy du 19/11 (question du comptable, Noël de l'UBAC) :
-- "combien de personnes accompagneront ?" sur un Événement club, pour
-- estimer le nombre total de personnes attendues. Un seul nombre, par
-- famille, sans date limite. Ajout seul (règle n°1) : aucune donnée
-- existante modifiée.

-- Case cochée par le Bureau sur un Événement club (OTHER) seulement.
alter table public.events
  add column if not exists ask_companions boolean not null default false;

-- Nombre de personnes qui accompagnent, porté par la réponse "Présent"
-- existante (une par licencié et par événement : les deux parents
-- modifient donc la même ligne). Entre frères et sœurs, le même nombre est
-- recopié sur chaque enfant présent, et le total ne le compte qu'une fois
-- par famille (src/lib/event-companions.ts). Plafond à 10 contre les
-- fautes de frappe.
alter table public.rsvps
  add column if not exists companions integer not null default 0
  check (companions >= 0 and companions <= 10);
