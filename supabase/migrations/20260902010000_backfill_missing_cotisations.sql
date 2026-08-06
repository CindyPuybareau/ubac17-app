-- One-off catch-up for members who already existed before the
-- category_tariffs trigger (20260902000000) — e.g. PUYBAREAU Cindy,
-- created manually before this feature existed and therefore missing
-- from the Cotisations tab entirely. Only inserts (never updates/
-- overwrites), only for active (non-archived) players, only when the
-- player's category has a tariff configured, and only when they don't
-- already have a cotisation row for the current season — so this is
-- entirely safe to paste again later, e.g. right after adding a tariff
-- for a category that had none the first time this ran.
with season as (
  select case when extract(month from now())::int >= 7
    then extract(year from now())::int
    else extract(year from now())::int - 1
  end as start_year
)
insert into public.cotisations (player_id, saison, prix, remise, paiement, statut, mode_paiement)
select
  p.id,
  (select start_year from season)::text || '-' || ((select start_year from season) + 1)::text,
  ct.prix,
  0,
  0,
  null,
  null
from public.players p
join public.category_tariffs ct on ct.category = p.category
where p.archived_at is null
  and not exists (
    select 1
    from public.cotisations c
    where c.player_id = p.id
      and c.saison = (select start_year from season)::text || '-' || ((select start_year from season) + 1)::text
  );
