-- Distinguer une famille désignée par le coach d'une famille qui s'est
-- proposée d'elle-même (bouton "Je m'en occupe").
--
-- Volontairement NULLABLE et sans valeur par défaut : les lignes déjà en
-- base ont pu être créées par un coach comme par un parent, et rien ne
-- permet de le savoir après coup. Leur mettre 'COACH' par défaut
-- affirmerait quelque chose de faux. Elles restent donc à null et
-- n'affichent aucun badge — seules les nouvelles attributions sont
-- qualifiées.
alter table public.event_tasks
  add column if not exists source text
    check (source is null or source in ('COACH', 'VOLUNTEER'));
