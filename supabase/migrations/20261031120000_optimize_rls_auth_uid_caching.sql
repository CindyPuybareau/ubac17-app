-- Retour de Cindy du 03/09 (sixième et dernier round de la soirée) : même
-- après les index (event_id, team_players.player_id, team_coaches.coach_id),
-- statement_timeout, et ANALYZE, le tableau de bord met encore jusqu'à 17-18s
-- à charger -- pg_stat_activity montre des requêtes tantôt instantanées,
-- tantôt à 7-8s SUR LA MÊME REQUÊTE, seule, sans autre utilisateur connecté.
--
-- En lisant le contenu réel de "select events for own teams" (table events) :
-- une règle à 6 branches, plusieurs jointures, des recherches dans des
-- tableaux (target_team_ids). Cette règle est redéclenchée EN CASCADE par
-- rsvps, event_tasks, event_carpool_offers et event_volunteer_needs à chaque
-- fois qu'ils vérifient qu'un événement lié existe et est visible -- donc
-- potentiellement réévaluée en entier pour CHAQUE ligne de ces tables
-- consultée.
--
-- Toutes ces règles (et les fonctions is_club_admin/is_team_coach/etc.)
-- appellent auth.uid()/auth.jwt() directement. Sans aide, Postgres peut les
-- recalculer à chaque ligne évaluée plutôt qu'une seule fois pour toute la
-- requête -- comportement documenté officiellement par Supabase comme un des
-- coûts cachés les plus courants des RLS ("Auth RLS Initialization Plan").
-- Écrire (select auth.uid()) au lieu de auth.uid() (même valeur, aucun
-- changement d'accès) permet à Postgres de le calculer UNE fois par requête
-- et de réutiliser le résultat pour chaque ligne, au lieu de le refaire à
-- chaque fois.
--
-- Portée : uniquement les endroits qui appellent auth.uid()/auth.jwt()
-- directement -- copié tel quel depuis pg_policies/pg_get_functiondef
-- (relevé en direct sur la base ce soir), seul auth.uid()/auth.jwt() est
-- entouré de (select ...), rien d'autre ne change. Les policies qui ne
-- l'appellent pas directement (ex: "select teammates rsvps", "select
-- volunteer needs for visible events") ne sont pas touchées ici.
--
-- Hors périmètre ce soir (source non vérifiée en direct, pas touché par
-- prudence) : is_my_child_team(), appelée par is_teammate_of_my_child() --
-- possible optimisation identique à revoir une prochaine fois si nécessaire.
--
-- Toute la migration dans une seule transaction : si une ligne échoue, tout
-- est annulé -- jamais de moment où une table se retrouve sans policy pour
-- une commande (ce qui bloquerait tout accès pour cette commande).
begin;

-- ===== events =====

drop policy if exists "coach delete own team events" on public.events;
create policy "coach delete own team events" on public.events
for delete
using (
  exists (
    select 1 from team_coaches tc
    where tc.team_id = events.team_id and tc.coach_id = (select auth.uid())
  )
);

drop policy if exists "coach manage own team events" on public.events;
create policy "coach manage own team events" on public.events
for insert
with check (
  exists (
    select 1 from team_coaches tc
    where tc.team_id = events.team_id and tc.coach_id = (select auth.uid())
  )
);

drop policy if exists "coach update own team events" on public.events;
create policy "coach update own team events" on public.events
for update
using (
  exists (
    select 1 from team_coaches tc
    where tc.team_id = events.team_id and tc.coach_id = (select auth.uid())
  )
);

drop policy if exists "select events for own teams" on public.events;
create policy "select events for own teams" on public.events
for select
using (
  is_club_admin()
  or (team_id is null and target_team_ids is null)
  or is_team_coach(team_id)
  or is_own_player_team(team_id)
  or exists (
    select 1 from team_players tp
    join parent_player pp on pp.player_id = tp.player_id
    where tp.team_id = events.team_id and pp.parent_id = (select auth.uid())
  )
  or (
    target_team_ids is not null
    and (
      exists (
        select 1 from team_coaches tc
        where tc.coach_id = (select auth.uid()) and tc.team_id = any (events.target_team_ids)
      )
      or exists (
        select 1 from team_players tp2
        join players pl on pl.id = tp2.player_id
        where tp2.team_id = any (events.target_team_ids) and pl.profile_id = (select auth.uid())
      )
      or exists (
        select 1 from team_players tp3
        join parent_player pp2 on pp2.player_id = tp3.player_id
        where tp3.team_id = any (events.target_team_ids) and pp2.parent_id = (select auth.uid())
      )
    )
  )
);

-- ===== rsvps =====

drop policy if exists "delete own rsvps" on public.rsvps;
create policy "delete own rsvps" on public.rsvps
for delete
using (
  exists (
    select 1 from parent_player pp
    where pp.player_id = rsvps.player_id and pp.parent_id = (select auth.uid())
  )
  or is_own_player(player_id)
);

drop policy if exists "insert own rsvps" on public.rsvps;
create policy "insert own rsvps" on public.rsvps
for insert
with check (
  exists (
    select 1 from parent_player pp
    where pp.player_id = rsvps.player_id and pp.parent_id = (select auth.uid())
  )
  or is_own_player(player_id)
);

drop policy if exists "select own or coached rsvps" on public.rsvps;
create policy "select own or coached rsvps" on public.rsvps
for select
using (
  exists (
    select 1 from parent_player pp
    where pp.player_id = rsvps.player_id and pp.parent_id = (select auth.uid())
  )
  or exists (
    select 1 from events e
    where e.id = rsvps.event_id
    and (
      is_team_coach(e.team_id)
      or (
        e.target_team_ids is not null
        and exists (
          select 1 from team_coaches tc
          where tc.coach_id = (select auth.uid()) and tc.team_id = any (e.target_team_ids)
        )
      )
    )
  )
);

drop policy if exists "update own rsvps" on public.rsvps;
create policy "update own rsvps" on public.rsvps
for update
using (
  exists (
    select 1 from parent_player pp
    where pp.player_id = rsvps.player_id and pp.parent_id = (select auth.uid())
  )
  or is_own_player(player_id)
);

-- ===== event_tasks =====

drop policy if exists "delete event_tasks for own context" on public.event_tasks;
create policy "delete event_tasks for own context" on public.event_tasks
for delete
using (
  is_club_admin()
  or exists (
    select 1 from events e where e.id = event_tasks.event_id and is_team_coach(e.team_id)
  )
  or exists (
    select 1 from parent_player pp
    where pp.player_id = event_tasks.player_id and pp.parent_id = (select auth.uid())
  )
  or is_own_player(player_id)
);

drop policy if exists "assign event_tasks for own context" on public.event_tasks;
create policy "assign event_tasks for own context" on public.event_tasks
for insert
with check (
  is_club_admin()
  or exists (
    select 1 from events e where e.id = event_tasks.event_id and is_team_coach(e.team_id)
  )
  or (
    exists (
      select 1 from parent_player pp
      where pp.player_id = event_tasks.player_id and pp.parent_id = (select auth.uid())
    )
    and exists (
      select 1 from events e
      join team_players tp on tp.team_id = e.team_id
      where e.id = event_tasks.event_id and tp.player_id = event_tasks.player_id
    )
  )
  or (
    is_own_player(player_id)
    and exists (
      select 1 from events e
      join team_players tp on tp.team_id = e.team_id
      where e.id = event_tasks.event_id and tp.player_id = event_tasks.player_id
    )
  )
);

drop policy if exists "select event_tasks for own context" on public.event_tasks;
create policy "select event_tasks for own context" on public.event_tasks
for select
using (
  is_club_admin()
  or exists (
    select 1 from events e where e.id = event_tasks.event_id and is_team_coach(e.team_id)
  )
  or exists (
    select 1 from events e
    join team_players tp on tp.team_id = e.team_id
    join parent_player pp on pp.player_id = tp.player_id
    where e.id = event_tasks.event_id and pp.parent_id = (select auth.uid())
  )
  or exists (
    select 1 from events e
    join team_players tp on tp.team_id = e.team_id
    where e.id = event_tasks.event_id and is_own_player(tp.player_id)
  )
);

-- ===== event_carpool_offers =====

drop policy if exists "delete own carpool offers" on public.event_carpool_offers;
create policy "delete own carpool offers" on public.event_carpool_offers
for delete
using (
  exists (
    select 1 from parent_player pp
    where pp.player_id = event_carpool_offers.player_id and pp.parent_id = (select auth.uid())
  )
  or is_own_player(player_id)
);

drop policy if exists "insert own carpool offers" on public.event_carpool_offers;
create policy "insert own carpool offers" on public.event_carpool_offers
for insert
with check (
  exists (
    select 1 from parent_player pp
    where pp.player_id = event_carpool_offers.player_id and pp.parent_id = (select auth.uid())
  )
  or is_own_player(player_id)
);

drop policy if exists "select carpool offers for own context" on public.event_carpool_offers;
create policy "select carpool offers for own context" on public.event_carpool_offers
for select
using (
  is_club_admin()
  or exists (
    select 1 from events e where e.id = event_carpool_offers.event_id and is_team_coach(e.team_id)
  )
  or exists (
    select 1 from events e
    join team_players tp on tp.team_id = e.team_id
    join parent_player pp on pp.player_id = tp.player_id
    where e.id = event_carpool_offers.event_id and pp.parent_id = (select auth.uid())
  )
  or exists (
    select 1 from events e
    join team_players tp on tp.team_id = e.team_id
    where e.id = event_carpool_offers.event_id and is_own_player(tp.player_id)
  )
);

drop policy if exists "update own carpool offers" on public.event_carpool_offers;
create policy "update own carpool offers" on public.event_carpool_offers
for update
using (
  exists (
    select 1 from parent_player pp
    where pp.player_id = event_carpool_offers.player_id and pp.parent_id = (select auth.uid())
  )
  or is_own_player(player_id)
);

-- ===== fonctions RLS (mêmes appels auth.uid()/auth.jwt() à l'intérieur) =====

create or replace function public.is_any_coach()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.team_coaches where coach_id = (select auth.uid())
  );
$function$;

create or replace function public.is_club_admin()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.club_administrators
    where lower(email) = lower((select auth.jwt()) ->> 'email')
  );
$function$;

create or replace function public.is_coach_anywhere()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.team_coaches tc where tc.coach_id = (select auth.uid())
  ) or exists (
    select 1
    from public.team_pending_coaches tpc
    join public.players p on p.id = tpc.player_id
    where p.profile_id = (select auth.uid())
  );
$function$;

create or replace function public.is_own_player(check_player_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1 from public.players p
    where p.id = check_player_id and p.profile_id = (select auth.uid())
  );
$function$;

create or replace function public.is_own_player_team(check_team_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (
    select 1
    from public.team_players tp
    join public.players p on p.id = tp.player_id
    where tp.team_id = check_team_id and p.profile_id = (select auth.uid())
  );
$function$;

create or replace function public.is_team_coach(check_team_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select exists (select 1 from public.team_coaches where team_id = check_team_id and coach_id = (select auth.uid()));
$function$;

commit;
