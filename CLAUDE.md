@AGENTS.md

# DIRECTIVES ARCHITECTURALES ET RÈGLES DE DÉVELOPPEMENT (UBAC 17)

## 1. PERSISTANCE ABSOLUE DE LA BASE DE DONNÉES (SUPABASE)
- RÈGLE SOUVERAINE : Ne JAMAIS exécuter de scripts de réinitialisation (`DROP TABLE`, `TRUNCATE`, ou re-seeding destructif) lors des migrations ou déploiements.
- TOUTES les données saisies par les utilisateurs (présences/absences, inscriptions covoiturage, désignation maillots/goûters, fiches enfants/parents) doivent PERSISTER indéfiniment.
- Seule une action explicite de suppression effectuée par un utilisateur autorisé depuis l'interface de l'application peut supprimer une entrée.

## 2. SYNCHRONISATION MATCHS FFBB (UPSERT INTELLIGENT)
- Les matchs synchronisés ou importés de la FFBB ne doivent JAMAIS être purgés automatiquement.
- Lors de la ré-actualisation / re-synchronisation des matchs FFBB, utiliser exclusivement un mécanisme de mise à jour/insertion (`UPSERT`).
- La mise à jour des horaires, scores ou gymnases NE DOIT EN AUCUN CAS supprimer les données d'organisation associées (présences, maillots, goûters, covoiturage).

## 3. UNICITÉ DU CALENDRIER & FILTRAGE DYNAMIQUE PAR RÔLE (360°)
Toutes les vues (Bureau, Coach, Parent) consomment LA MÊME source de données (`events`), filtrée dynamiquement :
- 🏢 ESPACE BUREAU : Accès à 100% des événements et données de toutes les équipes du club.
- 🧢 ESPACE COACH : Accès aux événements et données des équipes dont il est coach.
- 👨‍👩‍👧 ESPACE PARENT / JOUEUR : Accès aux événements, entraînements, matchs, stages et blocs d'organisation (maillots, goûters, covoiturage) correspondant STRICTEMENT aux équipes de leurs enfants (ex: Léonie et Raphaël pour puybareaucindy@gmail.com).

## 4. SYNCHRONISATION TEMPS RÉEL
Toute modification apportée par un rôle (ex: attribution d'un maillot/goûter, place de covoiturage) doit se répercuter en temps réel pour les autres rôles concernés, via **Supabase Realtime** (abonnement `postgres_changes` sur les tables `events`, `rsvps`, `event_tasks`, `event_carpool_offers`, `cotisations`, `team_players`, `team_coaches`, `players`) déclenchant un rafraîchissement de la page côté client (`router.refresh()`). Le projet n'utilise pas React Query ni SWR — ne pas les introduire sans raison explicite.

## 5. DESIGN & UI
- Icônes : Utiliser EXCLUSIVEMENT les icônes vectorielles SVG Lucide (`Cake`, `LogOut`, `Eye`, `EyeOff`, etc.).
- AUCUN emoji système dans les boutons ou la navigation.
- Le bouton "Se Déconnecter" doit rester accessible en permanence sur Mobile et PC.
