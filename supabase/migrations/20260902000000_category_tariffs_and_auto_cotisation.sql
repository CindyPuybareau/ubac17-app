-- Bureau-editable default price per team category (see the new "Tarifs
-- par catégorie" panel in the Cotisations tab). Feeds the trigger below so
-- a member's cotisation row can be created automatically with a real
-- amount rather than a guessed one.
create table if not exists public.category_tariffs (
  category text primary key,
  prix numeric not null,
  updated_at timestamptz not null default now()
);

alter table public.category_tariffs enable row level security;

drop policy if exists "admin manage category_tariffs" on public.category_tariffs;
create policy "admin manage category_tariffs"
  on public.category_tariffs for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.category_tariffs to authenticated;

-- Auto-creates this season's cotisation row for a player as soon as their
-- category is known (at creation, or later when a Bureau member assigns
-- them to a team) — never overwrites an existing row for that player+
-- season, so it's safe to fire repeatedly and never clobbers a payment
-- already recorded. Silently does nothing when the category has no tariff
-- configured yet (see category_tariffs) rather than inventing a price.
create or replace function public.sync_category_cotisation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  season_start int;
  season text;
  tarif numeric;
begin
  if new.category is null then
    return new;
  end if;

  select prix into tarif from public.category_tariffs where category = new.category;
  if tarif is null then
    return new;
  end if;

  -- Mirrors src/lib/season.ts's getCurrentSeasonLabel(): the club's season
  -- rolls over on July 1st.
  season_start := case when extract(month from now())::int >= 7
    then extract(year from now())::int
    else extract(year from now())::int - 1
  end;
  season := season_start::text || '-' || (season_start + 1)::text;

  insert into public.cotisations (player_id, saison, prix, remise, paiement, statut, mode_paiement)
  select new.id, season, tarif, 0, 0, null, null
  where not exists (
    select 1 from public.cotisations
    where player_id = new.id and saison = season
  );

  return new;
end;
$$;

drop trigger if exists trg_players_insert_cotisation on public.players;
create trigger trg_players_insert_cotisation
  after insert on public.players
  for each row
  execute function public.sync_category_cotisation();

drop trigger if exists trg_players_category_update_cotisation on public.players;
create trigger trg_players_category_update_cotisation
  after update of category on public.players
  for each row
  when (new.category is distinct from old.category)
  execute function public.sync_category_cotisation();
