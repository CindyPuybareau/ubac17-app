-- Fiche de test demandée par Cindy : un membre "démo" pour tester le
-- parcours coach sans toucher à une vraie fiche. Aucune équipe ni rôle
-- Coach assigné ici — volontairement laissé à faire depuis la fiche
-- (Membres > COACHRM3 demo > Licence & Équipe), pour ne pas donner accès
-- à l'effectif/aux coordonnées d'une vraie équipe (ex. Séniors 1) sans
-- que ce soit un choix explicite.
insert into public.players (first_name, last_name, registration_email)
values ('demo', 'COACHRM3', 'coach.rm3.demo@ubac17.fr');
