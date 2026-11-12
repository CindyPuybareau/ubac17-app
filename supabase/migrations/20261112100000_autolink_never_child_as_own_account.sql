-- Audit des connexions du 12/11 (demande de Cindy : "tout doit être
-- impeccable, sans casser les connexions actuelles").
--
-- 1) Trois fiches d'ENFANTS (nés en 2015, 2017, 2018) étaient reliées comme
--    "compte propre" au compte de leur mère : la règle de rattachement
--    automatique avait une 2e branche "une seule fiche porte cette adresse
--    -> c'est forcément toi", sans regarder l'âge. Or l'adresse
--    d'inscription d'une fiche d'enfant est presque toujours celle d'un
--    parent (116 des 119 fiches de mineurs). Correctif : cette 2e branche
--    (rattachement SANS correspondance de nom) ne vaut plus que pour une
--    fiche d'ADULTE (date de naissance connue, 18 ans ou plus). Une fiche
--    de mineur n'est reliée comme compte propre que si le prénom ET le nom
--    correspondent (ado avec son propre compte : les 13 cas réels actuels
--    passent tous par cette 1re branche, inchangée). Le parent, lui, reste
--    relié à l'enfant par pending_parent_email/secondary_email (inchangé ;
--    les 119 fiches de mineurs ont un pending_parent_email). Dans le doute,
--    rien n'est relié : le compte apparaît dans l'écran Bureau "Comptes à
--    rattacher" (unlinked-accounts-panel.tsx).
--
-- 2) Un email secondaire (2e parent) ajouté sur une fiche APRÈS que ce
--    parent a créé son compte n'était relié par rien : handle_new_user ne
--    tourne qu'à la création du compte, et le déclencheur sur la fiche
--    n'écoutait que pending_parent_email. claim_pending_parent_now couvre
--    désormais les deux colonnes (même garde-fou anti-auto-déclaration),
--    l'email secondaire uniquement pour une fiche de mineur.
--
-- Aucune donnée existante modifiée, aucun lien existant retiré : seules les
-- règles appliquées aux PROCHAINS rattachements automatiques changent.

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- Même chose pour le deuxième parent, via secondary_email (30/08) —
  -- même garde-fou anti-auto-déclaration.
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
      (
        new.raw_user_meta_data ->> 'first_name' is not null
        and new.raw_user_meta_data ->> 'last_name' is not null
        and unaccent(lower(trim(p.first_name))) = unaccent(lower(trim(new.raw_user_meta_data ->> 'first_name')))
        and unaccent(lower(trim(p.last_name))) = unaccent(lower(trim(new.raw_user_meta_data ->> 'last_name')))
      )
      or
      (
        -- 12/11 : sans correspondance de nom, uniquement une fiche d'adulte.
        p.birth_date is not null
        and p.birth_date <= current_date - interval '18 years'
        and not exists (
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
$function$;

create or replace function public.claim_own_player_now()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.profile_id is not null or new.registration_email is null then
    return new;
  end if;

  perform set_config('app.claim_own_player_bypass', 'true', true);

  update public.players p
  set profile_id = pr.id
  from public.profiles pr
  where p.id = new.id
    and p.profile_id is null
    and lower(trim(pr.email)) = lower(trim(new.registration_email))
    and (
      (
        unaccent(lower(trim(p.first_name))) = unaccent(lower(trim(pr.first_name)))
        and unaccent(lower(trim(p.last_name))) = unaccent(lower(trim(pr.last_name)))
      )
      or (
        -- 12/11 : sans correspondance de nom, uniquement une fiche d'adulte.
        p.birth_date is not null
        and p.birth_date <= current_date - interval '18 years'
        and not exists (
          select 1 from public.players p2
          where p2.id <> p.id
            and p2.registration_email is not null
            and lower(trim(p2.registration_email)) = lower(trim(p.registration_email))
        )
        and not exists (
          select 1 from public.parent_player pp
          where pp.player_id = p.id and pp.parent_id = pr.id
        )
      )
    );

  perform set_config('app.claim_own_player_bypass', 'false', true);

  return new;
end;
$function$;

create or replace function public.claim_pending_parent_now()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.pending_parent_email is null and new.secondary_email is null then
    return new;
  end if;

  insert into public.parent_player (parent_id, player_id)
  select pr.id, new.id
  from public.profiles pr
  where pr.email is not null
    and (
      (new.pending_parent_email is not null and trim(lower(pr.email)) = trim(lower(new.pending_parent_email)))
      -- Email secondaire : uniquement sur une fiche de MINEUR. Sur une
      -- fiche d'adulte, c'est souvent l'adresse d'un conjoint (cas réel
      -- vérifié le 12/11), jamais celle d'un "parent" à relier.
      or (
        new.secondary_email is not null
        and trim(lower(pr.email)) = trim(lower(new.secondary_email))
        and new.birth_date is not null
        and new.birth_date > current_date - interval '18 years'
      )
    )
    and not (
      pr.first_name is not null
      and pr.last_name is not null
      and trim(lower(pr.first_name)) = trim(lower(new.first_name))
      and trim(lower(pr.last_name)) = trim(lower(new.last_name))
    )
    -- Jamais "parent" de sa propre fiche (adulte dont l'email secondaire
    -- est le sien).
    and pr.id is distinct from new.profile_id
  on conflict do nothing;

  return new;
end;
$function$;

create or replace trigger claim_pending_parent_now
  after insert or update of pending_parent_email, secondary_email on public.players
  for each row execute function public.claim_pending_parent_now();
