-- Centre de notifications 360° : historique persistant des alertes déjà
-- poussées (changement d'horaire, convocation, rappel de match...), avec
-- un compteur non-lu par destinataire. Jusqu'ici ces alertes n'existaient
-- qu'en push navigateur, fugaces (ratées si l'app était fermée) — cette
-- table en garde la trace pour une vraie cloche consultable à tout moment.

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  -- null = alerte club entière (stage, événement club...). Les alertes
  -- ciblées (match, entraînement) portent le tri de leur équipe.
  team_id     uuid references public.teams(id) on delete cascade,
  -- on delete set null : une alerte "match annulé" doit rester lisible
  -- dans l'historique même une fois l'événement supprimé pour de bon.
  event_id    uuid references public.events(id) on delete set null,
  title       text not null,
  body        text not null,
  url         text,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_team_id_idx on public.notifications (team_id);
create index if not exists notifications_created_at_idx on public.notifications (created_at desc);

-- Un accusé de lecture par destinataire. Jamais écrit directement par un
-- client (RLS activée, aucune policy) : seulement via les fonctions
-- security definer ci-dessous (Parent/Coach/Bureau) ou par le service_role
-- (route API de l'Espace Enfant, qui vérifie elle-même le cookie de
-- session avant d'écrire) — même principe que verify_child_pin.
create table if not exists public.notification_reads (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  profile_id      uuid references auth.users(id) on delete cascade,
  player_id       uuid references public.players(id) on delete cascade,
  read_at         timestamptz not null default now(),
  constraint notification_reads_one_recipient check (
    (profile_id is not null and player_id is null) or
    (profile_id is null and player_id is not null)
  )
);

-- Index partiels plutôt qu'une contrainte unique classique : profile_id et
-- player_id sont chacun nullable, et deux NULL ne s'entre-bloquent jamais
-- dans une contrainte unique standard (ce qui laisserait passer des
-- doublons de lecture côté enfant).
create unique index if not exists notification_reads_profile_uniq
  on public.notification_reads (notification_id, profile_id) where profile_id is not null;
create unique index if not exists notification_reads_player_uniq
  on public.notification_reads (notification_id, player_id) where player_id is not null;

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
-- notification_reads : volontairement aucune policy — tout passage se
-- fait via les fonctions security definer ci-dessous (authentifié) ou via
-- service_role (route API de l'Espace Enfant, qui bypasse la RLS et
-- vérifie elle-même le cookie de session avant d'écrire).

-- notifications : lecture uniquement via notifications_for_me() (aucune
-- policy SELECT), mais l'écriture, elle, passe par le client authentifié
-- classique dans /api/send-push (pas service_role) — donc une vraie
-- policy INSERT, ouverte aux mêmes personnes que push_targets_for_event
-- autorise déjà à déclencher un envoi : le Bureau pour tout, un coach pour
-- sa ou ses équipes.
create policy "coach or admin can log notifications"
  on public.notifications for insert
  with check (
    (team_id is null and public.is_club_admin())
    or (team_id is not null and (public.is_club_admin() or public.is_team_coach(team_id)))
  );
grant insert on public.notifications to authenticated;

-- Interrupteur "recevoir les notifications" côté enfant : l'équivalent du
-- bouton Activer/Désactiver les notifications navigateur que Parent/Coach
-- ont déjà (push-subscribe.tsx) — un enfant n'a pas de compte auth.users
-- et ne peut donc pas posséder d'abonnement push, mais peut choisir de
-- masquer sa cloche. Actif par défaut : mieux vaut informé qu'oublié.
alter table public.players add column if not exists notifications_enabled boolean not null default true;

-- Historique + non-lu pour un profil authentifié (Parent/Coach/Bureau) :
-- mêmes règles de portée que push_targets_for_event (équipe(s) coachée(s),
-- équipe(s) de ses enfants, sa propre équipe de joueur si compte lié, tout
-- pour le Bureau), mais ici on lit l'historique plutôt que de cibler un
-- envoi.
create or replace function public.notifications_for_me(p_limit int default 30)
returns table (
  id uuid,
  team_id uuid,
  team_name text,
  event_id uuid,
  title text,
  body text,
  url text,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  select n.id, n.team_id, t.name, n.event_id, n.title, n.body, n.url, n.created_at, nr.read_at
  from public.notifications n
  left join public.teams t on t.id = n.team_id
  left join public.notification_reads nr on nr.notification_id = n.id and nr.profile_id = v_uid
  where
    n.team_id is null
    or public.is_club_admin()
    or public.is_team_coach(n.team_id)
    or n.team_id in (
      select tp.team_id from public.parent_player pp
      join public.team_players tp on tp.player_id = pp.player_id
      where pp.parent_id = v_uid
    )
    or n.team_id in (
      select tp2.team_id from public.players pl
      join public.team_players tp2 on tp2.player_id = pl.id
      where pl.profile_id = v_uid
    )
  order by n.created_at desc
  limit p_limit;
end;
$$;

grant execute on function public.notifications_for_me(int) to authenticated;

-- Marque comme lues toutes les alertes actuellement visibles par
-- l'appelant (celles que notifications_for_me() renverrait). Appelée à
-- l'ouverture de la cloche plutôt qu'un clic par notification — plus
-- simple, et le comportement attendu d'une cloche : l'ouvrir, c'est en
-- avoir pris connaissance.
create or replace function public.mark_all_notifications_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r record;
begin
  if v_uid is null then
    return;
  end if;

  for r in select id from public.notifications_for_me(200) where read_at is null loop
    begin
      insert into public.notification_reads (notification_id, profile_id) values (r.id, v_uid);
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$$;

grant execute on function public.mark_all_notifications_read() to authenticated;
