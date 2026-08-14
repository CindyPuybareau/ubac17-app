-- Covoiturage participatif : jusqu'ici une famille pouvait indiquer un
-- nombre de places, sans heure ni lieu de rendez-vous, et personne ne
-- pouvait réserver dessus — juste un chiffre affiché aux autres, à charge
-- pour eux de s'arranger par un autre canal. Cette migration ajoute le
-- volet manquant : un trajet a une heure et un lieu de rendez-vous
-- optionnels, et les autres familles réservent directement une place
-- dedans plutôt que de deviner qui a déjà de la place.

-- 1. Un trajet proposé peut préciser où et quand partir.
alter table public.event_carpool_offers
  add column if not exists departure_time timestamptz,
  add column if not exists meeting_point text;

-- 2. Réservations : une ligne par famille par trajet, jamais deux —
--    modifier son nombre de places est un update, pas une nouvelle ligne.
create table if not exists public.event_carpool_reservations (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.event_carpool_offers(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  seats integer not null default 1 check (seats > 0),
  created_at timestamptz not null default now(),
  unique (offer_id, player_id)
);

alter table public.event_carpool_reservations enable row level security;

-- Même visibilité que les trajets eux-mêmes : toute famille de l'équipe
-- doit voir qui a déjà réservé pour savoir combien de places restent, pas
-- seulement le conducteur.
drop policy if exists "select carpool reservations for own context" on public.event_carpool_reservations;
create policy "select carpool reservations for own context"
  on public.event_carpool_reservations for select
  using (
    public.is_club_admin()
    or exists (
      select 1
      from public.event_carpool_offers eco
      join public.events e on e.id = eco.event_id
      where eco.id = event_carpool_reservations.offer_id
        and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1
      from public.event_carpool_offers eco
      join public.events e on e.id = eco.event_id
      join public.team_players tp on tp.team_id = e.team_id
      join public.parent_player pp on pp.player_id = tp.player_id
      where eco.id = event_carpool_reservations.offer_id
        and pp.parent_id = auth.uid()
    )
  );

drop policy if exists "insert own carpool reservations" on public.event_carpool_reservations;
create policy "insert own carpool reservations"
  on public.event_carpool_reservations for insert
  with check (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_reservations.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_carpool_reservations.player_id)
  );

drop policy if exists "update own carpool reservations" on public.event_carpool_reservations;
create policy "update own carpool reservations"
  on public.event_carpool_reservations for update
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_reservations.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_carpool_reservations.player_id)
  );

-- Annuler sa réservation, mais aussi : le conducteur peut la retirer de
-- son côté (un passager qui se décommande par téléphone plutôt que dans
-- l'appli ne doit pas laisser une place bloquée indéfiniment).
drop policy if exists "delete own or driver carpool reservations" on public.event_carpool_reservations;
create policy "delete own or driver carpool reservations"
  on public.event_carpool_reservations for delete
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_reservations.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_carpool_reservations.player_id)
    or exists (
      select 1 from public.event_carpool_offers eco
      where eco.id = event_carpool_reservations.offer_id
        and (
          exists (
            select 1 from public.parent_player pp2
            where pp2.player_id = eco.player_id and pp2.parent_id = auth.uid()
          )
          or public.is_own_player(eco.player_id)
        )
    )
  );

grant select, insert, update, delete on public.event_carpool_reservations to authenticated;

-- Sync 360° (règle CLAUDE.md #4) : sans ça, une réservation faite par une
-- famille n'apparaîtrait chez le conducteur ou une autre famille qu'après
-- un F5.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_carpool_reservations'
  ) then
    alter publication supabase_realtime add table public.event_carpool_reservations;
  end if;
end $$;

-- 3. Garde-fou : jamais plus de réservations que de places offertes. Une
--    voiture n'a pas de siège élastique — contrairement à un rsvp,
--    survendre une place est une vraie erreur, pas juste une donnée à
--    corriger plus tard.
create or replace function public.check_carpool_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offered integer;
  reserved integer;
begin
  select seats into offered from public.event_carpool_offers where id = new.offer_id;

  select coalesce(sum(seats), 0) into reserved
  from public.event_carpool_reservations
  where offer_id = new.offer_id and id <> new.id;

  if reserved + new.seats > offered then
    raise exception 'Plus assez de places disponibles sur ce trajet.';
  end if;

  return new;
end;
$$;

drop trigger if exists check_carpool_capacity on public.event_carpool_reservations;
create trigger check_carpool_capacity
  before insert or update on public.event_carpool_reservations
  for each row execute function public.check_carpool_capacity();

-- Même garde côté offre : un conducteur ne peut pas descendre son nombre
-- de places sous ce qui est déjà réservé, ça invaliderait des réservations
-- existantes en silence.
create or replace function public.check_carpool_offer_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved integer;
begin
  select coalesce(sum(seats), 0) into reserved
  from public.event_carpool_reservations
  where offer_id = new.id;

  if new.seats < reserved then
    raise exception 'Des places sont déjà réservées : impossible de descendre en dessous de %.', reserved;
  end if;

  return new;
end;
$$;

drop trigger if exists check_carpool_offer_capacity on public.event_carpool_offers;
create trigger check_carpool_offer_capacity
  before update on public.event_carpool_offers
  for each row execute function public.check_carpool_offer_capacity();
