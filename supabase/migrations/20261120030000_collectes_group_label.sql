-- Retour du comptable du 25/10 ("stage de la Toussaint géré comme 6
-- événements distincts, pas de vision consolidée") : étiquette de
-- regroupement optionnelle -- les collectes qui partagent la même
-- valeur non nulle sont affichées regroupées (un "dossier") sur
-- l'écran Événements payants, avec un total consolidé. Texte libre
-- plutôt qu'une vraie relation parent/enfant (décision de Cindy, "cocher
-- + regrouper" plutôt qu'un objet "événement parent") : plus simple,
-- aucune contrainte de cascade à gérer, une collecte peut rejoindre ou
-- quitter un groupe en ne touchant qu'à sa propre ligne.
alter table public.collectes add column if not exists group_label text;
