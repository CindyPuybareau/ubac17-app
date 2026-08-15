-- Espace enfant sans email/téléphone : un lien privé par famille (jamais
-- deviné, jamais public — même famille de solution que le
-- regenerate_calendar_token de 20260923000000_calendar_subscribe.sql) +
-- un code PIN à 4 chiffres par enfant, haché avec pgcrypto (jamais en
-- clair). Tout passe par des fonctions security definer plutôt que par des
-- policies RLS classiques : ni le lien famille ni le PIN ne doivent
-- dépendre d'une session Supabase (l'enfant n'en a justement aucune), donc
-- la fonction EST le contrôle d'accès, exactement comme calendar_feed_events.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists family_access_code uuid unique;

alter table public.players
  add column if not exists pin_hash text,
  add column if not exists pin_failed_attempts integer not null default 0,
  add column if not exists pin_locked_until timestamptz,
  add column if not exists pin_set_at timestamptz;

-- Génère (ou renouvelle) le lien d'accès enfant du parent connecté.
create or replace function public.regenerate_family_access_code()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code uuid := gen_random_uuid();
begin
  update public.profiles set family_access_code = v_code where id = auth.uid();
  return v_code;
end;
$$;

grant execute on function public.regenerate_family_access_code() to authenticated;

-- Enfants du foyer titulaire de ce lien, uniquement ceux avec un PIN déjà
-- configuré (un enfant sans PIN n'a rien à faire dans le sélecteur de
-- connexion) — jamais le parent lui-même si son propre profil est aussi
-- lié à une fiche joueur. "anon" : l'appareil qui ouvre ce lien n'a par
-- définition aucune session.
create or replace function public.family_access_children(p_code uuid)
returns table (id uuid, first_name text)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_parent_id uuid;
begin
  select pr.id into v_parent_id from public.profiles pr where pr.family_access_code = p_code;
  if v_parent_id is null then
    return;
  end if;

  return query
  select p.id, p.first_name
  from public.players p
  join public.parent_player pp on pp.player_id = p.id
  where pp.parent_id = v_parent_id
    and p.pin_hash is not null
    and p.profile_id is distinct from v_parent_id;
end;
$$;

grant execute on function public.family_access_children(uuid) to anon, authenticated;

-- Définir/changer le PIN d'un enfant : vérifie que l'appelant est bien un
-- parent de ce joueur avant d'écrire quoi que ce soit — pin_hash n'est
-- volontairement couvert par aucune policy RLS d'écriture directe, cette
-- fonction est le seul chemin possible.
create or replace function public.set_child_pin(p_player_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pin !~ '^\d{4}$' then
    raise exception 'Le code doit comporter exactement 4 chiffres.';
  end if;

  if not exists (
    select 1 from public.parent_player
    where player_id = p_player_id and parent_id = auth.uid()
  ) then
    raise exception 'Non autorisé.';
  end if;

  update public.players
  set pin_hash = crypt(p_pin, gen_salt('bf')),
      pin_set_at = now(),
      pin_failed_attempts = 0,
      pin_locked_until = null
  where id = p_player_id;
end;
$$;

grant execute on function public.set_child_pin(uuid, text) to authenticated;

-- Vérifie le PIN d'un enfant pour CE lien de famille précis (p_player_id
-- doit appartenir au foyer de p_code, jamais un id arbitraire) : blocage
-- 15 minutes après 5 essais ratés, compteur remis à zéro dès un succès.
-- "for update" verrouille la ligne le temps de la vérification pour éviter
-- une course entre deux tentatives simultanées sur le même PIN.
create or replace function public.verify_child_pin(p_code uuid, p_player_id uuid, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_id uuid;
  v_hash text;
  v_attempts integer;
  v_locked_until timestamptz;
  v_new_attempts integer;
begin
  select pr.id into v_parent_id from public.profiles pr where pr.family_access_code = p_code;
  if v_parent_id is null then
    return null;
  end if;

  select p.pin_hash, p.pin_failed_attempts, p.pin_locked_until
    into v_hash, v_attempts, v_locked_until
  from public.players p
  join public.parent_player pp on pp.player_id = p.id
  where p.id = p_player_id and pp.parent_id = v_parent_id
  for update of p;

  if v_hash is null then
    return null;
  end if;

  if v_locked_until is not null and v_locked_until > now() then
    raise exception 'Trop de tentatives, réessaie dans quelques minutes.';
  end if;

  if crypt(p_pin, v_hash) = v_hash then
    update public.players
    set pin_failed_attempts = 0, pin_locked_until = null
    where id = p_player_id;
    return p_player_id;
  end if;

  v_new_attempts := coalesce(v_attempts, 0) + 1;
  if v_new_attempts >= 5 then
    update public.players
    set pin_failed_attempts = 0, pin_locked_until = now() + interval '15 minutes'
    where id = p_player_id;
  else
    update public.players
    set pin_failed_attempts = v_new_attempts
    where id = p_player_id;
  end if;
  return null;
end;
$$;

grant execute on function public.verify_child_pin(uuid, uuid, text) to anon, authenticated;
