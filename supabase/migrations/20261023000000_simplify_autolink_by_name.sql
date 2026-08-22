-- Retour de Cindy du 2026-08-22 après avoir retrouvé un 2e cas (Emilie
-- ROBERT / sa fille Leonore GAUTHIER, même schéma que Sandrine/Elikya) :
-- "il faut trouver une astuce pour que ça ne se reproduise pas, on ne va
-- pas faire ces manipulations à chaque fois."
--
-- La version précédente (20261022000000) corrigeait déjà le bug mais
-- gardait une logique fragile (compter les fiches partageant un email, en
-- excluant celles déjà repérées comme enfants via parent_player) — plus
-- compliquée que nécessaire, et plus difficile à vérifier avant coup.
--
-- Nouvelle logique, plus directe : une fiche est reliée au compte qui se
-- crée si (a) son nom correspond au nom du compte (c'est clairement son
-- titulaire, peu importe combien d'autres fiches partagent son email —
-- des enfants, par exemple), ou (b) aucune autre fiche ne partage cet
-- email du tout (aucune ambiguïté possible même sans info de nom). Plus
-- besoin de la table parent_player pour cette décision.

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

  -- Ne pas se déclarer "parent de soi-même" si pending_parent_email pointe
  -- (à tort) vers sa propre adresse et que le nom correspond au compte.
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

  update public.players p
  set profile_id = new.id
  where p.profile_id is null
    and p.registration_email is not null
    and lower(p.registration_email) = lower(new.email)
    and (
      -- Cas 1 : le nom de la fiche correspond au nom du compte -> c'est
      -- clairement le titulaire.
      (
        new.raw_user_meta_data ->> 'first_name' is not null
        and new.raw_user_meta_data ->> 'last_name' is not null
        and lower(p.first_name) = lower(new.raw_user_meta_data ->> 'first_name')
        and lower(p.last_name) = lower(new.raw_user_meta_data ->> 'last_name')
      )
      or
      -- Cas 2 : aucune autre fiche ne partage cet email -> pas d'ambiguïté
      -- possible, même sans nom de compte à comparer.
      not exists (
        select 1 from public.players p2
        where p2.id <> p.id
          and p2.registration_email is not null
          and lower(p2.registration_email) = lower(p.registration_email)
      )
    )
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

-- Rattrapage pour Emilie ROBERT (même cas que Sandrine, repéré via la
-- même vérification demandée à Cindy) : identifiants exacts, aucune
-- heuristique en masse.
update public.players
set profile_id = '422b794f-5c47-4b3c-afc4-e35b154717f1'
where id = '357a641c-1962-4529-b197-d14237b903c5'
  and profile_id is null;

insert into public.parent_player (parent_id, player_id)
values ('422b794f-5c47-4b3c-afc4-e35b154717f1', 'f82ac808-be80-4432-b6ea-3d69e6610f5b')
on conflict do nothing;
