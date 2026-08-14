-- Abonnement au calendrier depuis l'agenda personnel (Google/Apple).
--
-- Une appli d'agenda qui "s'abonne" à une URL ne se connecte jamais avec
-- un compte : elle fait juste des requêtes GET anonymes de temps en temps.
-- Le circuit d'autorisation habituel (RLS + session Supabase) ne peut donc
-- pas s'appliquer ici. À la place, chaque parent reçoit un lien avec un
-- jeton secret dans l'URL — c'est ce jeton qui fait office de clé, pas une
-- connexion. Même famille de solution que le "lien secret" d'un agenda
-- Google : pas un mot de passe, mais une adresse qu'on ne partage pas.
--
-- Peu sensible si le lien fuit malgré tout : il ne révèle qu'un calendrier
-- de matchs et d'entraînements, rien sur les enfants eux-mêmes.

alter table public.profiles add column if not exists calendar_token uuid unique;

-- Générer (ou renouveler) son propre jeton. Une fonction dédiée plutôt
-- qu'un update client classique : elle ne dépend d'aucune policy RLS
-- existante sur profiles, ne touche jamais que la ligne de l'appelant
-- (auth.uid()), et couvre aussi bien la première génération que le
-- renouvellement si le lien a été partagé par erreur.
create or replace function public.regenerate_calendar_token()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  update public.profiles set calendar_token = v_token where id = auth.uid();
  return v_token;
end;
$$;

grant execute on function public.regenerate_calendar_token() to authenticated;

-- security definer : cette fonction EST le contrôle d'accès (elle vérifie
-- le jeton elle-même), donc elle doit pouvoir lire au-delà de ce que la
-- RLS autoriserait pour un appelant anonyme. Résultat vide si le jeton ne
-- correspond à personne, plutôt qu'une erreur qui aiderait à deviner les
-- jetons valides.
create or replace function public.calendar_feed_events(p_token uuid)
returns table (
  id uuid,
  title text,
  event_type text,
  is_home boolean,
  location text,
  salle text,
  start_time timestamptz,
  end_time timestamptz,
  team_name text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p where p.calendar_token = p_token;
  if v_profile_id is null then
    return;
  end if;

  return query
  select
    e.id, e.title, e.event_type, e.is_home, e.location, e.salle,
    e.start_time, e.end_time,
    coalesce(t.name, 'Tous les groupes') as team_name
  from public.events e
  left join public.teams t on t.id = e.team_id
  where e.team_id is null
     or e.team_id in (
       -- Équipes des enfants de ce parent.
       select tp.team_id
       from public.parent_player pp
       join public.team_players tp on tp.player_id = pp.player_id
       where pp.parent_id = v_profile_id
       union
       -- L'équipe du joueur lui-même, s'il a son propre compte (majeur).
       select tp2.team_id
       from public.players pl
       join public.team_players tp2 on tp2.player_id = pl.id
       where pl.profile_id = v_profile_id
     )
  order by e.start_time;
end;
$$;

-- "anon" et pas seulement "authenticated" : une appli d'agenda qui
-- s'abonne à l'URL n'a justement aucune session Supabase.
grant execute on function public.calendar_feed_events(uuid) to anon, authenticated;
