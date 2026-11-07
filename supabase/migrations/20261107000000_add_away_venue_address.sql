-- Retour de Cindy du 07/11 ("les itinéraires ne sont pas bons") : pour un
-- match extérieur, la synchro FFBB ne posait que "Extérieur" comme lieu
-- (jamais une vraie adresse) -- le bouton Itinéraire envoyait donc
-- littéralement "Extérieur" à Google Maps/Waze. La fiche détail de chaque
-- match sur la FFBB (lien url_competition, déjà présent dans les données
-- lues pour la date/le score) contient le nom et l'adresse réels de la
-- salle adverse -- cette colonne les stocke une fois récupérés, pour que
-- l'itinéraire pointe sur le bon gymnase sans jamais retourner les
-- rechercher une fois connus (voir ffbb-sync.ts).
alter table public.events
  add column if not exists away_venue_address text;
