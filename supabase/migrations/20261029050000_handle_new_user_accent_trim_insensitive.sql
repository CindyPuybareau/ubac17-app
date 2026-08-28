-- Trouvé lors de l'audit du 28/08 : les comparaisons de handle_new_user()
-- reposent sur une égalité de chaînes stricte (après lower() seulement).
-- Deux soucis distincts :
--   1. Les prénoms/noms ne sont ni "trim()"-és ni insensibles aux accents
--      — une fiche FFBB importée "LEONORE GAUTHIER" (sans accent) face à
--      une saisie "Léonore" au clavier, ou une espace de fin de saisie
--      mobile, empêchent la reconnaissance "cette fiche est bien la
--      sienne" (cas 1), faisant retomber sur le cas 2 — avec les deux
--      risques symétriques déjà vus (rattachement à la mauvaise personne,
--      ou aucun rattachement du tout si l'email est aussi partagé).
--   2. Les emails de contact (pending_parent_email/registration_email) ne
--      sont comparés qu'en lower(), jamais en trim() — contrairement à
--      claim_coach_invite_now (déjà correct) — une espace de fin de
--      cellule Excel (banal en copier-coller) empêche silencieusement le
--      rattachement.
create extension if not exists unaccent;

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
