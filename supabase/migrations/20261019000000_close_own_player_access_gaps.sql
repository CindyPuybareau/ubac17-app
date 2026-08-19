-- Suite de 20261017000000 (event_tasks) et 20261018000000 (rsvps) : audit
-- complet de toutes les policies RLS écrites sur le modèle "un parent agit
-- pour son enfant" (parent_player), pour vérifier lesquelles oubliaient le
-- cas "le joueur agit pour lui-même" (is_own_player) — retour de Cindy du
-- 2026-08-20, qui s'inquiétait à raison du nombre de bugs de cette famille
-- trouvés coup sur coup. Ferme les quatre derniers trous identifiés :
-- covoiturage (offres + réservations) et visibilité de sa propre
-- cotisation/paiement. Les autres policies du même modèle (players,
-- team_players, whatsapp_group_members, teammates rsvps...) ont été
-- vérifiées et couvrent déjà ce cas, directement ou via un helper
-- équivalent — rien d'autre à corriger.

-- 1. Covoiturage : proposer un trajet (event_carpool_offers). Un joueur
-- majeur ne pouvait ni voir, ni proposer, ni modifier, ni retirer son
-- propre trajet.
drop policy if exists "select carpool offers for own context" on public.event_carpool_offers;
create policy "select carpool offers for own context"
  on public.event_carpool_offers for select
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_carpool_offers.event_id and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1
      from public.events e
      join public.team_players tp on tp.team_id = e.team_id
      join public.parent_player pp on pp.player_id = tp.player_id
      where e.id = event_carpool_offers.event_id and pp.parent_id = auth.uid()
    )
    or exists (
      select 1
      from public.events e
      join public.team_players tp on tp.team_id = e.team_id
      where e.id = event_carpool_offers.event_id and public.is_own_player(tp.player_id)
    )
  );

drop policy if exists "insert own carpool offers" on public.event_carpool_offers;
create policy "insert own carpool offers"
  on public.event_carpool_offers for insert
  with check (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_offers.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_carpool_offers.player_id)
  );

drop policy if exists "update own carpool offers" on public.event_carpool_offers;
create policy "update own carpool offers"
  on public.event_carpool_offers for update
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_offers.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_carpool_offers.player_id)
  );

drop policy if exists "delete own carpool offers" on public.event_carpool_offers;
create policy "delete own carpool offers"
  on public.event_carpool_offers for delete
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_carpool_offers.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_carpool_offers.player_id)
  );

-- 2. Covoiturage : voir les réservations des autres (event_carpool_reservations
-- avait déjà is_own_player() en insert/update/delete depuis sa création,
-- 20260922000000, mais pas en lecture — un joueur majeur pouvait réserver
-- une place sans jamais voir qui d'autre avait déjà réservé).
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
    or exists (
      select 1
      from public.event_carpool_offers eco
      join public.events e on e.id = eco.event_id
      join public.team_players tp on tp.team_id = e.team_id
      where eco.id = event_carpool_reservations.offer_id
        and public.is_own_player(tp.player_id)
    )
  );

-- 3. Cotisation et paiements : un membre majeur cotisant pour lui-même
-- (sans parent_player) ne pouvait pas voir sa propre cotisation ni son
-- historique de paiement dans son espace Famille.
drop policy if exists "select own linked cotisations" on public.cotisations;
create policy "select own linked cotisations"
  on public.cotisations for select
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = cotisations.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(cotisations.player_id)
  );

drop policy if exists "select own linked cotisation_payments" on public.cotisation_payments;
create policy "select own linked cotisation_payments"
  on public.cotisation_payments for select
  using (
    exists (
      select 1
      from public.cotisations c
      join public.parent_player pp on pp.player_id = c.player_id
      where c.id = cotisation_payments.cotisation_id and pp.parent_id = auth.uid()
    )
    or exists (
      select 1
      from public.cotisations c
      where c.id = cotisation_payments.cotisation_id and public.is_own_player(c.player_id)
    )
  );
