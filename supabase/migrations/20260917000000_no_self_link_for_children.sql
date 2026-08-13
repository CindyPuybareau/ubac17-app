-- Ne pas confondre "le titulaire du compte" et "son enfant".
--
-- À l'inscription, une fiche joueur est rattachée au compte quand elle
-- porte la même adresse e-mail — à condition qu'elle soit la seule. Ce
-- garde-fou visait les familles à plusieurs enfants, mais laisse passer le
-- cas le plus courant : un parent qui inscrit UN enfant sous sa propre
-- adresse. La fiche de l'enfant devient alors "la sienne", et l'app le
-- présente comme joueur — d'où l'onglet "Toi" à la place du prénom de
-- l'enfant dans l'espace Parent.
--
-- Une fiche déclarée comme l'enfant de quelqu'un n'est jamais la fiche du
-- titulaire du compte : c'est cette condition qui manquait.

-- 1. Réparation ciblée : on ne délie que les fiches rattachées au compte
--    de leur propre parent déclaré. Aucune autre ligne n'est touchée, et
--    la fiche elle-même reste intacte — seul le lien de compte tombe.
update public.players p
set profile_id = null
where p.profile_id is not null
  and exists (
    select 1
    from public.parent_player pp
    where pp.player_id = p.id
      and pp.parent_id = p.profile_id
  );

-- 2. La règle, pour que ça ne se reproduise pas à la prochaine
--    inscription. Fonction reprise à l'identique de
--    20260819000000_real_coach_roster.sql, à la seule exception de la
--    condition "and not exists (... parent_player ...)".
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

  insert into public.parent_player (parent_id, player_id)
  select new.id, p.id
  from public.players p
  where p.pending_parent_email is not null
    and lower(p.pending_parent_email) = lower(new.email)
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
    and (
      select count(*) from public.players p2
      where p2.registration_email is not null
        and lower(p2.registration_email) = lower(new.email)
    ) = 1
    -- Une fiche declaree comme l'enfant de CE compte n'est pas la fiche de
    -- son titulaire. Le rattachement parent/enfant a ete fait juste
    -- au-dessus, il est donc deja visible ici. Condition volontairement
    -- etroite : un joueur majeur qui cree son propre compte doit toujours
    -- pouvoir recuperer sa fiche, meme si un parent y est declare.
    and not exists (
      select 1
      from public.parent_player pp
      where pp.player_id = players.id
        and pp.parent_id = new.id
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
