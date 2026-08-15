-- Correctif : sur Supabase, pgcrypto (crypt/gen_salt) s'installe dans le
-- schéma "extensions", pas "public" — nos fonctions n'y cherchaient pas,
-- d'où "function gen_salt(unknown) does not exist" au premier essai de
-- code PIN. On ajoute "extensions" au search_path des deux fonctions qui
-- en ont besoin.

create or replace function public.set_child_pin(p_player_id uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
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

create or replace function public.verify_child_pin(p_code uuid, p_player_id uuid, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
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
