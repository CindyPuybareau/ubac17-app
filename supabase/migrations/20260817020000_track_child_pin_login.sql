-- L'indicateur de connexion du tableau Membres (voir la migration
-- 20260817010000) ne suivait que les comptes Supabase Auth classiques
-- (Parent/Coach/Bureau) — un enfant qui se connecte par code PIN n'en a
-- pas et restait toujours affiché "jamais connecté", même après un vrai
-- usage réel de l'appli.

alter table public.players add column if not exists last_child_login_at timestamptz;

-- Reprise à l'identique de verify_child_pin (20261009000000), seule
-- différence : horodate last_child_login_at à chaque code correct.
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
