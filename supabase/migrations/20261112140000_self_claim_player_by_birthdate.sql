-- Retour de Cindy du 12/11 ("pourquoi les comptes ne pourraient pas se
-- relier automatiquement ?") : un compte créé avec une adresse inconnue du
-- club (cas des 30 comptes "vides" de l'audit) peut désormais se relier
-- LUI-MÊME à sa fiche, ou à celle de son enfant, depuis l'écran "Ton espace
-- n'est pas encore relié" -- en donnant prénom + nom + DATE DE NAISSANCE du
-- joueur. Le nom seul ne suffit jamais (cas réels du 12/11 : un père inscrit
-- sous le nom de sa fille) : la date de naissance sert de preuve.
--
-- Garde-fous :
--   - ne relie QUE le compte connecté (auth.uid()), jamais un autre ;
--   - une seule fiche active (hors équipe démo) doit correspondre exactement
--     au prénom + nom (accents/casse ignorés, ordre inversé accepté) + date
--     de naissance -- sinon rien n'est fait ;
--   - "c'est moi" : refusé si la fiche a déjà un compte, ou si ce compte est
--     déjà la fiche de quelqu'un ;
--   - 5 essais maximum par compte et par 24 h (impossible de deviner une
--     date de naissance à force d'essais) ;
--   - chaque rattachement réussi prévient le Bureau (cloche, réservée au
--     Bureau) : il garde la main et peut défaire depuis la fiche.
-- Aucune donnée existante modifiée par cette migration.

create table if not exists public.player_claim_attempts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists player_claim_attempts_profile_created_idx
  on public.player_claim_attempts (profile_id, created_at);
-- Lue/écrite uniquement par la fonction ci-dessous (security definer) :
-- RLS activée sans aucune policy = aucun accès direct depuis l'appli.
alter table public.player_claim_attempts enable row level security;

create or replace function public.claim_player_by_birthdate(
  p_first_name text,
  p_last_name text,
  p_birth_date date,
  p_role text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_attempts integer;
  v_first text := unaccent(lower(trim(coalesce(p_first_name, ''))));
  v_last text := unaccent(lower(trim(coalesce(p_last_name, ''))));
  v_match_count integer;
  v_player_id uuid;
  v_player_profile uuid;
  v_player_name text;
  v_account_name text;
begin
  if v_uid is null then
    return 'not_authenticated';
  end if;
  if p_role not in ('self', 'parent') or v_first = '' or v_last = '' or p_birth_date is null then
    return 'invalid';
  end if;

  select count(*) into v_attempts
  from public.player_claim_attempts
  where profile_id = v_uid and created_at > now() - interval '24 hours';
  if v_attempts >= 5 then
    return 'too_many_attempts';
  end if;
  insert into public.player_claim_attempts (profile_id) values (v_uid);

  select count(*), min(p.id::text)::uuid into v_match_count, v_player_id
  from public.players p
  where p.archived_at is null
    and p.birth_date = p_birth_date
    and (
      (unaccent(lower(trim(p.first_name))) = v_first and unaccent(lower(trim(p.last_name))) = v_last)
      or (unaccent(lower(trim(p.first_name))) = v_last and unaccent(lower(trim(p.last_name))) = v_first)
    )
    and not exists (
      select 1 from public.team_players tp join public.teams t on t.id = tp.team_id
      where tp.player_id = p.id
      group by tp.player_id
      having bool_and(t.is_demo)
    );

  if v_match_count <> 1 then
    return 'not_found';
  end if;

  select p.profile_id, trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
    into v_player_profile, v_player_name
  from public.players p where p.id = v_player_id;
  select trim(coalesce(pr.first_name, '') || ' ' || coalesce(pr.last_name, '')) into v_account_name
  from public.profiles pr where pr.id = v_uid;

  if p_role = 'self' then
    if v_player_profile is not null then
      return 'already_linked';
    end if;
    if exists (select 1 from public.players p2 where p2.profile_id = v_uid) then
      return 'already_linked';
    end if;
    perform set_config('app.claim_own_player_bypass', 'true', true);
    update public.players set profile_id = v_uid where id = v_player_id and profile_id is null;
    perform set_config('app.claim_own_player_bypass', 'false', true);
  else
    if v_player_profile = v_uid then
      return 'already_linked';
    end if;
    if exists (select 1 from public.parent_player where parent_id = v_uid and player_id = v_player_id) then
      return 'already_linked';
    end if;
    insert into public.parent_player (parent_id, player_id)
    values (v_uid, v_player_id)
    on conflict do nothing;
  end if;

  insert into public.notifications (restricted_audience, title, body, url)
  values (
    'BUREAU',
    'Compte relié par la personne',
    coalesce(nullif(v_account_name, ''), 'Un compte') ||
      case when p_role = 'self' then ' s''est relié à sa fiche (' else ' s''est relié comme parent de ' end ||
      v_player_name ||
      case when p_role = 'self' then ')' else '' end ||
      ' avec la date de naissance. À vérifier dans Membres si besoin.',
    '/dashboard?section=members'
  );

  return case when p_role = 'self' then 'linked_self' else 'linked_parent' end;
end;
$function$;

revoke all on function public.claim_player_by_birthdate(text, text, date, text) from public, anon;
grant execute on function public.claim_player_by_birthdate(text, text, date, text) to authenticated;
