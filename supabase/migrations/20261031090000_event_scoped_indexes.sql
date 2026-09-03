-- Retour de Cindy du 03/09 ("je veux qu'on trouve une solution ici pour se
-- connecter rapidement") : en relisant les règles de sécurité (RLS) des
-- tables qui timeout depuis deux jours (rsvps, event_tasks,
-- event_volunteer_needs, event_carpool_offers), une vraie cause concrète
-- trouvée -- event_volunteer_needs n'a AUCUN index sur event_id, seulement
-- une contrainte de clé étrangère (qui, en Postgres, ne crée PAS d'index
-- automatiquement -- piège classique et bien connu). Chaque
-- .in("event_id", tranche) que fait getVolunteerNeedsByEventId() doit
-- donc parcourir la table ENTIÈRE à chaque appel, ligne par ligne, pour
-- chaque tranche -- indépendamment du nombre de requêtes en même temps,
-- ce qui explique pourquoi le plafond de connexions posé ce soir n'a pas
-- suffi à lui seul.
--
-- rsvps a le même profil (table "enfant" d'events, créée avant que
-- l'habitude d'indexer event_id ne s'installe -- voir
-- collectes_event_id_idx, whatsapp_messages..., posés à partir du 25/08)
-- et n'a jamais eu son propre index dédié dans aucune migration.
--
-- event_tasks et event_carpool_offers ont déjà une contrainte unique
-- (event_id, ...) qui fournit indirectement un index utilisable pour ce
-- genre de recherche (event_id en tête) -- ajoutés ici quand même,
-- explicitement, pour ne plus jamais dépendre de cet effet de bord.
--
-- "if not exists" : sans risque même si l'un d'eux existe déjà sous un
-- autre nom -- juste un index de plus, jamais une donnée touchée.
create index if not exists rsvps_event_id_idx on public.rsvps (event_id);
create index if not exists event_volunteer_needs_event_id_idx on public.event_volunteer_needs (event_id);
create index if not exists event_tasks_event_id_idx on public.event_tasks (event_id);
create index if not exists event_carpool_offers_event_id_idx on public.event_carpool_offers (event_id);
