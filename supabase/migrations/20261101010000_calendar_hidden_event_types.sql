-- Filtre "Filtrer par type" du Calendrier (vues Mois/Liste), demande de
-- Cindy du 10/09 : remplace le bouton "Masquer les entraînements" par un
-- filtre par type d'événement (Entraînement/Match officiel/Match amical/
-- Tournoi/Événement club, cases à cocher, tout coché par défaut) mémorisé
-- par compte -- pas juste en local dans le navigateur, retrouvé à la
-- prochaine connexion sur n'importe quel appareil.
--
-- Une seule colonne sur profiles (même principe que
-- benevoles.notifications_enabled / players.notifications_enabled : un
-- réglage sur SA PROPRE fiche) plutôt qu'une table à part : on stocke les
-- types DÉCOCHÉS (masqués), pas les cochés -- un tableau vide veut dire
-- "tout affiché", l'état par défaut, sans avoir à connaître la liste
-- complète des types côté base.
alter table public.profiles
  add column if not exists calendar_hidden_event_types text[] not null default '{}';

-- Pas de nouvelle policy RLS nécessaire : "Modifier son propre profil"
-- (auth.uid() = id) couvre déjà l'écriture de cette colonne comme les
-- autres (téléphone, nom...).
