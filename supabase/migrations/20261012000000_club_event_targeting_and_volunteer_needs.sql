-- ============================================================
-- 1. Ciblage multi-équipes pour les événements club (Bureau)
-- ============================================================
-- Jusqu'ici un événement club (team_id null) était forcément "Tous les
-- groupes" : impossible de le réserver à quelques équipes précises (ex.
-- "Octobre Rose" seulement pour U18M et U13M). target_team_ids introduit
-- ce cas intermédiaire :
--   - team_id renseigné            -> une seule équipe (matchs,
--     entraînements — inchangé).
--   - team_id null, target_team_ids null/vide -> tout le club (inchangé,
--     "Tous les groupes").
--   - team_id null, target_team_ids rempli     -> visible seulement aux
--     membres des équipes listées (nouveau).
alter table public.events
  add column if not exists target_team_ids uuid[];

drop policy if exists "select events for own teams" on public.events;
create policy "select events for own teams"
  on public.events for select
  using (
    public.is_club_admin()
    or (team_id is null and target_team_ids is null)
    or public.is_team_coach(team_id)
    or public.is_own_player_team(team_id)
    or exists (
      select 1
      from public.team_players tp
      join public.parent_player pp on pp.player_id = tp.player_id
      where tp.team_id = events.team_id and pp.parent_id = auth.uid()
    )
    or (
      target_team_ids is not null
      and (
        exists (
          select 1 from public.team_coaches tc
          where tc.coach_id = auth.uid() and tc.team_id = any(events.target_team_ids)
        )
        or exists (
          select 1
          from public.team_players tp2
          join public.players pl on pl.id = tp2.player_id
          where tp2.team_id = any(events.target_team_ids) and pl.profile_id = auth.uid()
        )
        or exists (
          select 1
          from public.team_players tp3
          join public.parent_player pp2 on pp2.player_id = tp3.player_id
          where tp3.team_id = any(events.target_team_ids) and pp2.parent_id = auth.uid()
        )
      )
    )
  );

-- push_targets_for_event() et notifications_for_me() doivent connaître le
-- même ciblage, sinon un événement réservé à deux équipes apparaîtrait
-- dans le calendrier des familles concernées mais jamais dans leur cloche
-- ni leurs notifications push (règle CLAUDE.md #4, cohérence 360°).
create or replace function public.push_targets_for_event(p_event_id uuid)
returns table (endpoint text, p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team uuid;
  v_targets uuid[];
  v_exists boolean;
begin
  select e.team_id, e.target_team_ids, true into v_team, v_targets, v_exists
  from public.events e
  where e.id = p_event_id;

  if not coalesce(v_exists, false) then
    return;
  end if;

  -- Un événement club (team_id null) ne concerne aucune équipe coach en
  -- particulier : seul le Bureau peut le diffuser, ciblé ou non.
  if not (
    public.is_club_admin()
    or (v_team is not null and public.is_team_coach(v_team))
  ) then
    return;
  end if;

  return query
  select distinct s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.profile_id <> auth.uid()
    and s.profile_id in (
      -- Les parents des joueurs concernés.
      select pp.parent_id
      from public.parent_player pp
      join public.team_players tp on tp.player_id = pp.player_id
      where (v_team is null and v_targets is null)
         or tp.team_id = v_team
         or (v_targets is not null and tp.team_id = any(v_targets))
      union
      -- Les joueurs qui ont leur propre compte (majeurs, séniors...).
      select pl.profile_id
      from public.players pl
      join public.team_players tp2 on tp2.player_id = pl.id
      where pl.profile_id is not null
        and (
          (v_team is null and v_targets is null)
          or tp2.team_id = v_team
          or (v_targets is not null and tp2.team_id = any(v_targets))
        )
      union
      -- Les coachs de l'équipe concernée (ou de toutes, sur un événement
      -- club) — jamais celui qui envoie lui-même, déjà exclu ci-dessus.
      select tc.coach_id
      from public.team_coaches tc
      where (v_team is null and v_targets is null)
         or tc.team_id = v_team
         or (v_targets is not null and tc.team_id = any(v_targets))
    );
end;
$$;

-- Même ciblage pour la cloche in-app (historique persistant).
alter table public.notifications
  add column if not exists target_team_ids uuid[];

drop policy if exists "coach or admin can log notifications" on public.notifications;
create policy "coach or admin can log notifications"
  on public.notifications for insert
  with check (
    public.is_club_admin()
    or (team_id is not null and target_team_ids is null and public.is_team_coach(team_id))
  );

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
    (n.team_id is null and n.target_team_ids is null)
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
    or (
      n.target_team_ids is not null
      and (
        exists (
          select 1 from public.team_coaches tc
          where tc.coach_id = v_uid and tc.team_id = any(n.target_team_ids)
        )
        or exists (
          select 1 from public.team_players tp3
          join public.parent_player pp2 on pp2.player_id = tp3.player_id
          where pp2.parent_id = v_uid and tp3.team_id = any(n.target_team_ids)
        )
        or exists (
          select 1 from public.team_players tp4
          join public.players pl2 on pl2.id = tp4.player_id
          where pl2.profile_id = v_uid and tp4.team_id = any(n.target_team_ids)
        )
      )
    )
  order by n.created_at desc
  limit p_limit;
end;
$$;

-- calendar_feed_events() (abonnement iCal externe) traitait déjà team_id
-- null comme "tout le club" — sans ce correctif, un événement réservé à
-- deux équipes via target_team_ids fuiterait dans l'agenda externe de
-- TOUT LE MONDE, y compris des familles hors cible.
create or replace function public.calendar_feed_events(p_token uuid)
returns table (
  id uuid,
  title text,
  event_type text,
  is_home boolean,
  location text,
  salle text,
  start_time timestamptz,
  end_time timestamptz,
  team_name text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select p.id into v_profile_id from public.profiles p where p.calendar_token = p_token;
  if v_profile_id is null then
    return;
  end if;

  return query
  select
    e.id, e.title, e.event_type, e.is_home, e.location, e.salle,
    e.start_time, e.end_time,
    coalesce(t.name, 'Tous les groupes') as team_name
  from public.events e
  left join public.teams t on t.id = e.team_id
  where (e.team_id is null and e.target_team_ids is null)
     or e.team_id in (
       select tp.team_id
       from public.parent_player pp
       join public.team_players tp on tp.player_id = pp.player_id
       where pp.parent_id = v_profile_id
       union
       select tp2.team_id
       from public.players pl
       join public.team_players tp2 on tp2.player_id = pl.id
       where pl.profile_id = v_profile_id
       union
       select tc.team_id
       from public.team_coaches tc
       where tc.coach_id = v_profile_id
     )
     or (
       e.target_team_ids is not null
       and e.target_team_ids && (
         select coalesce(array_agg(team_id), '{}') from (
           select tp.team_id
           from public.parent_player pp
           join public.team_players tp on tp.player_id = pp.player_id
           where pp.parent_id = v_profile_id
           union
           select tp2.team_id
           from public.players pl
           join public.team_players tp2 on tp2.player_id = pl.id
           where pl.profile_id = v_profile_id
           union
           select tc.team_id
           from public.team_coaches tc
           where tc.coach_id = v_profile_id
         ) as my_teams
       )
     )
  order by e.start_time;
end;
$$;

-- ============================================================
-- 2. Besoins en bénévoles (buvette, table de marque, arbitrage...)
-- ============================================================
-- Nouveaux rôles du catalogue commun, à côté des deux déjà là (lavage des
-- maillots / goûter) — mêmes règles que 20260911000000_custom_event_roles :
-- une ligne de référence, pas une valeur en dur.
insert into public.event_role_types (code, label, icon, event_types, sort_order)
values
  ('BUVETTE', 'Buvette', 'Coffee', '{}', 30),
  ('TABLE_MARQUE', 'Table de marque', 'ClipboardList', '{}', 40),
  ('ARBITRAGE', 'Arbitrage', 'Flag', '{}', 50),
  ('INSTALLATION', 'Installation / Rangement', 'KeyRound', '{}', 60),
  ('PATISSERIE', 'Pâtisserie / Remplacement', 'Utensils', '{}', 70)
on conflict (code) do nothing;

-- Un "besoin" décrit un créneau à couvrir sur un événement : quel rôle,
-- sur quelle tranche horaire (texte libre, ex. "14h00 - 16h00" — un
-- horaire de bénévolat n'a pas besoin d'être un vrai timestamp, juste
-- lisible), pour combien de personnes. Plusieurs besoins peuvent partager
-- le même rôle sur un même événement (ex. Buvette 14h-16h ET 16h-18h,
-- avec des bénévoles différents).
create table if not exists public.event_volunteer_needs (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null references public.events(id) on delete cascade,
  role_code       text not null references public.event_role_types(code),
  time_range      text,
  required_count  integer not null default 1 check (required_count > 0),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.event_volunteer_needs enable row level security;

-- Visible à qui voit déjà l'événement : un exists() sur events suffit,
-- puisque la RLS de events (ci-dessus) filtre déjà qui a le droit de voir
-- quelle ligne — pas besoin de reproduire toute la logique de ciblage ici.
drop policy if exists "select volunteer needs for visible events" on public.event_volunteer_needs;
create policy "select volunteer needs for visible events"
  on public.event_volunteer_needs for select
  using (exists (select 1 from public.events e where e.id = event_volunteer_needs.event_id));

-- Seul le Bureau définit les besoins (le formulaire qui les crée vit dans
-- l'espace Bureau/Secrétariat, voir CLAUDE.md de la demande).
drop policy if exists "admin manage volunteer needs" on public.event_volunteer_needs;
create policy "admin manage volunteer needs"
  on public.event_volunteer_needs for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.event_volunteer_needs to authenticated;

-- Une inscription = un joueur (soi-même, ou son enfant) couvre un besoin.
-- Plusieurs bénévoles par besoin (contrairement à event_tasks, verrouillé
-- à un seul par (event_id, task_type)) : d'où unique(need_id, player_id)
-- plutôt qu'unique(need_id) seul.
create table if not exists public.event_volunteer_signups (
  id          uuid primary key default gen_random_uuid(),
  need_id     uuid not null references public.event_volunteer_needs(id) on delete cascade,
  player_id   uuid not null references public.players(id) on delete cascade,
  source      text not null default 'VOLUNTEER' check (source in ('VOLUNTEER', 'ADMIN')),
  created_at  timestamptz not null default now(),
  unique (need_id, player_id)
);

alter table public.event_volunteer_signups enable row level security;

drop policy if exists "select volunteer signups for visible needs" on public.event_volunteer_signups;
create policy "select volunteer signups for visible needs"
  on public.event_volunteer_signups for select
  using (
    exists (select 1 from public.event_volunteer_needs n where n.id = event_volunteer_signups.need_id)
  );

drop policy if exists "self or admin insert volunteer signups" on public.event_volunteer_signups;
create policy "self or admin insert volunteer signups"
  on public.event_volunteer_signups for insert
  with check (
    public.is_club_admin()
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_volunteer_signups.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_volunteer_signups.player_id)
  );

-- Pas de policy update : on annule puis re-signe plutôt que de réattribuer
-- une ligne existante — même principe que event_tasks côté retrait, plus
-- simple qu'un flux update pour un seul champ (player_id) qui n'a de sens
-- que recréé, pas modifié.
drop policy if exists "self or admin delete volunteer signups" on public.event_volunteer_signups;
create policy "self or admin delete volunteer signups"
  on public.event_volunteer_signups for delete
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_volunteer_signups.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_volunteer_signups.player_id)
  );

grant select, insert, delete on public.event_volunteer_signups to authenticated;

-- Garde-fou : un créneau ne prend pas plus de monde qu'annoncé — sauf pour
-- le Bureau, qui peut sciemment dépasser le besoin ("affecter... si
-- besoin" de la demande peut vouloir dire mettre une personne de plus en
-- renfort). Même schéma que check_carpool_capacity.
create or replace function public.check_volunteer_signup_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  needed integer;
  taken integer;
begin
  if public.is_club_admin() then
    return new;
  end if;

  select required_count into needed
  from public.event_volunteer_needs
  where id = new.need_id;

  select count(*) into taken
  from public.event_volunteer_signups
  where need_id = new.need_id and id <> new.id;

  if taken >= coalesce(needed, 1) then
    raise exception 'Ce créneau est déjà complet.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_volunteer_signup_capacity on public.event_volunteer_signups;
create trigger check_volunteer_signup_capacity
  before insert on public.event_volunteer_signups
  for each row execute function public.check_volunteer_signup_capacity();

-- Sync 360° (règle CLAUDE.md #4) : une inscription ou un besoin ajouté par
-- le Bureau doit apparaître chez les familles concernées sans F5.
do $$
declare
  t text;
begin
  foreach t in array array['event_volunteer_needs', 'event_volunteer_signups']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
