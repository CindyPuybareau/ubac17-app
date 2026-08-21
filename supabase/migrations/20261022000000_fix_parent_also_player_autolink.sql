-- Un parent qui est aussi joueur/coach et partage son email avec un de ses
-- enfants ne se faisait jamais relier automatiquement à sa propre fiche
-- (retour de Cindy du 2026-08-22, repéré via la fiche de Sandrine
-- MANZELLE).
--
-- Le garde-fou anti-ambiguïté de handle_new_user() (compter les fiches
-- partageant le même registration_email, refuser de relier si > 1) ne
-- distinguait pas "cette fiche EST le compte qui se crée" de "cette fiche
-- est l'enfant du compte, qui partage forcément le même email par
-- construction" — les deux cas ont exactement le même email. Résultat :
-- Sandrine (joueuse) partageant son email avec sa fille Elikya n'était
-- jamais reliée, ni l'une ni l'autre.
--
-- Le bon critère pour "cette fiche EST le compte" est le NOM (fiche vs
-- métadonnées du compte à l'inscription), jamais l'email seul.
--
-- Note sur l'historique de cette correction : plusieurs tentatives ont été
-- nécessaires en production avant d'arriver à cette version (une tentative
-- de nettoyage basée sur l'email a d'abord supprimé par erreur le lien
-- légitime Sandrine -> Elikya, et une mise à jour en masse a ensuite lié
-- la fiche d'Elikya au compte de sa mère par erreur). Ce fichier reflète
-- l'état correct final tel que réparé et vérifié en production le
-- 2026-08-22 — un nouveau projet appliquant les migrations dans l'ordre
-- obtient directement ce résultat, sans repasser par les étapes
-- intermédiaires ratées.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  linked_player_id uuid;
begin
  insert into public.profiles (id, first_name, last_name, phone, email, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'first_name',
    new.raw_user_meta_data ->> 'last_name',
    new.raw_user_meta_data ->> 'phone',
    new.email,
    'PARENT'
  );

  -- Ne pas se déclarer "parent de soi-même" : si le nom de la fiche
  -- correspond au nom du compte qui se crée, c'est la fiche du titulaire,
  -- pas celle d'un enfant, même si pending_parent_email pointe (à tort ou
  -- par coïncidence) vers sa propre adresse.
  insert into public.parent_player (parent_id, player_id)
  select new.id, p.id
  from public.players p
  where p.pending_parent_email is not null
    and lower(p.pending_parent_email) = lower(new.email)
    and not (
      new.raw_user_meta_data ->> 'first_name' is not null
      and new.raw_user_meta_data ->> 'last_name' is not null
      and lower(p.first_name) = lower(new.raw_user_meta_data ->> 'first_name')
      and lower(p.last_name) = lower(new.raw_user_meta_data ->> 'last_name')
    )
  on conflict do nothing;

  insert into public.team_coaches (team_id, coach_id)
  select tci.team_id, new.id
  from public.team_coach_invites tci
  where lower(tci.email) = lower(new.email)
  on conflict do nothing;

  update public.teams
  set pending_coach_names = null
  where id in (
    select tci.team_id
    from public.team_coach_invites tci
    where lower(tci.email) = lower(new.email)
  );

  update public.players
  set profile_id = new.id
  where profile_id is null
    and registration_email is not null
    and lower(registration_email) = lower(new.email)
    -- Une fiche declaree comme l'enfant de CE compte n'est pas la fiche de
    -- son titulaire. Le rattachement parent/enfant a ete fait juste
    -- au-dessus, il est donc deja visible ici.
    and not exists (
      select 1
      from public.parent_player pp
      where pp.player_id = players.id
        and pp.parent_id = new.id
    )
    -- Le comptage d'ambiguite exclut lui aussi les fiches deja identifiees
    -- comme enfants de ce compte, sinon un parent qui est aussi joueur et
    -- partage son email avec un enfant se retrouvait bloque par son propre
    -- enfant.
    and (
      select count(*) from public.players p2
      where p2.registration_email is not null
        and lower(p2.registration_email) = lower(new.email)
        and p2.profile_id is null
        and not exists (
          select 1
          from public.parent_player pp2
          where pp2.player_id = p2.id
            and pp2.parent_id = new.id
        )
    ) = 1
  returning id into linked_player_id;

  if linked_player_id is not null then
    delete from public.team_pending_coaches
    where player_id = linked_player_id
      and team_id in (
        select tci.team_id
        from public.team_coach_invites tci
        where lower(tci.email) = lower(new.email)
      );
  end if;

  return new;
end;
$$;

-- Rattrapage ciblé pour la famille Manzelle (les seules identifiées comme
-- affectées à ce jour) : Sandrine reliée à son propre compte, le lien
-- parent/enfant vers Elikya garanti présent, la fiche d'Elikya explicitement
-- non reliée à un compte (elle utilisera son propre accès enfant plus
-- tard, indépendant de celui de sa mère). Volontairement écrit par
-- identifiant exact plutôt que par une règle générique : une tentative de
-- rattrapage générique en masse s'est avérée trop fragile en production
-- pour ce cas précis (deux fiches candidates pour le même email).
update public.players
set profile_id = null
where id = 'dfab801f-6550-464c-b431-c86c9affef37'
  and profile_id = 'c80b4541-47d7-41a0-9b6a-8bbd3df0734c';

update public.players
set profile_id = 'c80b4541-47d7-41a0-9b6a-8bbd3df0734c'
where id = 'dd12c950-5dd1-4d94-88fd-bb2096f97d1d'
  and profile_id is null;

insert into public.parent_player (parent_id, player_id)
values ('c80b4541-47d7-41a0-9b6a-8bbd3df0734c', 'dfab801f-6550-464c-b431-c86c9affef37')
on conflict do nothing;
