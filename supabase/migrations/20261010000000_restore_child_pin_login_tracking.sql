-- La migration 20261009000000 (correctif pgcrypto : gen_salt/crypt vivent
-- dans le schéma "extensions", pas "public") a réécrit verify_child_pin()
-- en entier -- et a accidentellement effacé l'enregistrement de
-- last_child_login_at ajouté par 20260817020000. Un "create or replace"
-- remplace tout le corps de la fonction, il n'y a pas de fusion possible
-- entre deux migrations qui touchent la même fonction : la plus récente
-- gagne toujours. Conséquence concrète : depuis cette migration, AUCUNE
-- connexion par code PIN n'était plus enregistrée, quel que soit l'enfant
-- -- pas un cas particulier de Léonie ou Raphaël.
--
-- Cette migration reprend la version corrigée (recherche pgcrypto dans
-- extensions) et lui rend son enregistrement de connexion.

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
    set pin_failed_attempts = 0, pin_locked_until = null, last_child_login_at = now()
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
