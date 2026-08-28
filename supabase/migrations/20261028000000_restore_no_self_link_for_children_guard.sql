-- Trouvé lors de l'audit global du 28/08 : la simplification du 22/08
-- (20261023000000_simplify_autolink_by_name.sql) a supprimé sans le
-- vouloir un garde-fou posé le 17/09 (20260917000000_no_self_link_for_
-- children.sql) : rien n'empêche plus le "cas 2" (aucune autre fiche ne
-- partage cet email) de rattacher la fiche d'un ENFANT au compte de son
-- PARENT qui vient de s'inscrire, dès que les noms ne correspondent pas
-- exactement (accent manquant, espace, casse FFBB vs saisie clavier...).
--
-- Schéma concret (le cas le plus courant du club, un parent + un enfant) :
-- Lucas MARTIN est importé avec registration_email = pending_parent_email
-- = marie.martin@gmail.com. Marie s'inscrit avec cet email : l'insert
-- parent_player (ligne 39 de la fonction) crée bien le lien parent/enfant
-- normal. Mais juste après, le "cas 2" du players update voit que Lucas
-- est la SEULE fiche sur cet email et lui assigne profile_id = celui de
-- Marie -- la fiche de l'enfant devient "le compte" de sa mère.
--
-- Le correctif : on ne retombe sur le cas 2 que si cette fiche n'est pas
-- déjà l'enfant de la personne qui s'inscrit (elle vient d'être liée par
-- l'insert parent_player juste au-dessus, dans le même trigger).
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
      -- possible, même sans nom de compte à comparer. Mais jamais si cette
      -- fiche vient justement d'être reliée comme ENFANT de la personne
      -- qui s'inscrit (garde-fou du 17/09, réintroduit ici).
      (
        not exists (
          select 1 from public.players p2
          where p2.id <> p.id
            and p2.registration_email is not null
            and lower(p2.registration_email) = lower(p.registration_email)
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
        where lower(tci.email) = lower(new.email)
      );
  end if;

  return new;
end;
$$;
