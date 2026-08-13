-- Notifications push : abonnements des navigateurs + ciblage des familles.
--
-- Un abonnement appartient à un compte et à un appareil : un même parent
-- qui ouvre l'app sur son téléphone et sur son PC a deux lignes. L'endpoint
-- est unique — c'est l'adresse que le service de push (Google, Apple,
-- Mozilla) attribue à ce navigateur.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Chacun ne voit et ne gère que ses propres abonnements. Personne n'a à
-- lire l'endpoint d'un autre : c'est une adresse d'envoi personnelle.
drop policy if exists "manage own push subscriptions" on public.push_subscriptions;
create policy "manage own push subscriptions"
  on public.push_subscriptions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Le coach doit pouvoir envoyer aux familles de son équipe, donc lire des
-- abonnements qui ne sont pas les siens — ce que la policy ci-dessus
-- interdit, à juste titre. D'où cette fonction security definer : elle
-- contourne la RLS mais vérifie elle-même que l'appelant encadre bien
-- l'équipe concernée, et ne renvoie que ce qu'il faut pour envoyer.
create or replace function public.push_targets_for_event(p_event_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_exists boolean;
begin
  select e.team_id, true into v_team, v_exists
  from public.events e
  where e.id = p_event_id;

  if not coalesce(v_exists, false) then
    return;
  end if;

  -- Un événement club (team_id null) ne concerne aucune équipe en
  -- particulier : seul le Bureau peut le diffuser à tout le monde.
  if not (
    public.is_club_admin()
    or (v_team is not null and public.is_team_coach(v_team))
  ) then
    return;
  end if;

  return query
  select distinct s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.profile_id in (
    -- Les parents des joueurs concernés.
    select pp.parent_id
    from public.parent_player pp
    join public.team_players tp on tp.player_id = pp.player_id
    where v_team is null or tp.team_id = v_team
    union
    -- Les joueurs qui ont leur propre compte (majeurs, séniors...).
    select pl.profile_id
    from public.players pl
    join public.team_players tp2 on tp2.player_id = pl.id
    where pl.profile_id is not null
      and (v_team is null or tp2.team_id = v_team)
  );
end;
$$;

grant execute on function public.push_targets_for_event(uuid) to authenticated;
