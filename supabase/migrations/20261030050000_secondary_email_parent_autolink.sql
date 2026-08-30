-- Retour de Cindy du 30/08 : un deuxième parent (garde partagée, familles
-- recomposées) qui crée son compte avec l'adresse renseignée dans
-- players.secondary_email n'était jamais reconnu comme parent de l'enfant
-- — handle_new_user() ne comparait que pending_parent_email et
-- registration_email, jamais secondary_email, alors que ce champ existe
-- précisément pour ce cas.
--
-- Même mécanisme et même garde-fou que le bloc pending_parent_email juste
-- au-dessus (jamais se déclarer "parent de soi-même" si l'adresse
-- correspond en fait au nom du compte qui s'inscrit) : bloc séparé plutôt
-- que fusionné, pour rester aussi simple à relire que l'existant.
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
    and trim(lower(p.pending_parent_email)) = trim(lower(new.email))
    and not (
      new.raw_user_meta_data ->> 'first_name' is not null
      and new.raw_user_meta_data ->> 'last_name' is not null
      and unaccent(lower(trim(p.first_name))) = unaccent(lower(trim(new.raw_user_meta_data ->> 'first_name')))
      and unaccent(lower(trim(p.last_name))) = unaccent(lower(trim(new.raw_user_meta_data ->> 'last_name')))
    )
  on conflict do nothing;

  -- Même chose pour le deuxième parent, via secondary_email (nouveau,
  -- 30/08) — même garde-fou anti-auto-déclaration.
  insert into public.parent_player (parent_id, player_id)
  select new.id, p.id
  from public.players p
  where p.secondary_email is not null
    and trim(lower(p.secondary_email)) = trim(lower(new.email))
    and not (
      new.raw_user_meta_data ->> 'first_name' is not null
      and new.raw_user_meta_data ->> 'last_name' is not null
      and unaccent(lower(trim(p.first_name))) = unaccent(lower(trim(new.raw_user_meta_data ->> 'first_name')))
      and unaccent(lower(trim(p.last_name))) = unaccent(lower(trim(new.raw_user_meta_data ->> 'last_name')))
    )
  on conflict do nothing;

  insert into public.team_coaches (team_id, coach_id)
  select tci.team_id, new.id
  from public.team_coach_invites tci
  where trim(lower(tci.email)) = trim(lower(new.email))
  on conflict do nothing;

  update public.teams
  set pending_coach_names = null
  where id in (
    select tci.team_id
    from public.team_coach_invites tci
    where trim(lower(tci.email)) = trim(lower(new.email))
  );

  update public.players p
  set profile_id = new.id
  where p.profile_id is null
    and p.registration_email is not null
    and trim(lower(p.registration_email)) = trim(lower(new.email))
    and (
      -- Cas 1 : le nom de la fiche correspond au nom du compte -> c'est
      -- clairement le titulaire. Insensible aux accents et aux espaces de
      -- bord (fiche FFBB importée sans accent, saisie clavier avec).
      (
        new.raw_user_meta_data ->> 'first_name' is not null
        and new.raw_user_meta_data ->> 'last_name' is not null
        and unaccent(lower(trim(p.first_name))) = unaccent(lower(trim(new.raw_user_meta_data ->> 'first_name')))
        and unaccent(lower(trim(p.last_name))) = unaccent(lower(trim(new.raw_user_meta_data ->> 'last_name')))
      )
      or
      -- Cas 2 : aucune autre fiche ne partage cet email -> pas d'ambiguïté
      -- possible, même sans nom de compte à comparer. Mais jamais si cette
      -- fiche vient justement d'être reliée comme ENFANT de la personne
      -- qui s'inscrit (garde-fou du 17/09, réintroduit le 28/08).
      (
        not exists (
          select 1 from public.players p2
          where p2.id <> p.id
            and p2.registration_email is not null
            and trim(lower(p2.registration_email)) = trim(lower(p.registration_email))
        )
        and not exists (
          select 1 from public.parent_player pp
          where pp.player_id = p.id and pp.parent_id = new.id
        )
      )
    )
  returning id into linked_player_id;

  if linked_player_id is not null then
    delete from public.team_pending_coaches
    where player_id = linked_player_id
      and team_id in (
        select tci.team_id
        from public.team_coach_invites tci
        where trim(lower(tci.email)) = trim(lower(new.email))
      );
  end if;

  return new;
end;
$$;

-- Rattrapage ponctuel : relie immédiatement les comptes déjà créés avant ce
-- correctif dont l'email correspond au secondary_email d'un enfant, encore
-- non relié à ce parent-là. Même garde-fou anti-auto-déclaration que
-- ci-dessus. Sûr à recoller (on conflict do nothing, ne modifie jamais une
-- ligne déjà existante).
insert into public.parent_player (parent_id, player_id)
select pr.id, p.id
from public.players p
join public.profiles pr on trim(lower(pr.email)) = trim(lower(p.secondary_email))
where p.secondary_email is not null
  and not (
    pr.first_name is not null
    and pr.last_name is not null
    and unaccent(lower(trim(p.first_name))) = unaccent(lower(trim(pr.first_name)))
    and unaccent(lower(trim(p.last_name))) = unaccent(lower(trim(pr.last_name)))
  )
on conflict do nothing;
