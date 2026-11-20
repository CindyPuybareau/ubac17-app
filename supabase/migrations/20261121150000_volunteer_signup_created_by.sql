-- Retour de Cindy du 20/11 (papa d'une joueuse inscrit comme accompagnant
-- des Babys : "il ne peut pas y avoir une croix s'il change d'avis ?") :
-- une inscription par nom libre (bandeau "Besoin accompagnant") ne
-- retenait pas QUI l'avait faite, donc personne d'autre que le Bureau ou le
-- coach ne pouvait la retirer.
--
-- Ajout seul (règle n°1) : nouvelle colonne remplie automatiquement à
-- l'inscription (compte connecté), et droit de supprimer UNIQUEMENT une
-- inscription qu'on a soi-même créée. Les inscriptions existantes restent
-- sans auteur (created_by null) : elles se retirent toujours via le Bureau
-- ou le coach, comme avant. Aucune donnée existante modifiée.

alter table public.event_volunteer_signups
  add column if not exists created_by uuid default auth.uid();

create index if not exists event_volunteer_signups_created_by_idx
  on public.event_volunteer_signups (created_by);

create policy "self delete own volunteer signup" on public.event_volunteer_signups
for delete
using (created_by is not null and created_by = (select auth.uid()));
