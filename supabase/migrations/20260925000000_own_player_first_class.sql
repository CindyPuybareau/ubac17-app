-- Raphaël (majeur, aucun enfant) a créé son propre compte avec sa propre
-- adresse mail, et s'est vu répondre "Aucun espace n'est encore rattaché
-- à ton compte" dès sa toute première connexion — alors que sa fiche
-- joueur existe bel et bien et que le trigger d'inscription l'a
-- correctement liée (players.profile_id = son compte).
--
-- Root cause, à deux étages :
--
-- 1. Côté appli (page.tsx) : l'onglet Famille n'apparaît que si `players`
--    est non vide, et ce tableau n'était construit qu'à partir de
--    parent_player (les enfants dont on est le parent). Un joueur qui
--    n'est le parent de personne — juste lié à SA PROPRE fiche via
--    players.profile_id — n'y figurait jamais. Corrigé séparément dans
--    page.tsx : on complète `players` avec la propre fiche du compte
--    quand elle existe et n'y est pas déjà.
--
-- 2. Côté RLS (cette migration) : même une fois ce complément fait côté
--    appli, presque toutes les policies de lecture/écriture "famille"
--    (events, rsvps, cotisations, event_tasks, carpool...) ne
--    reconnaissaient QUE le chemin parent_player.parent_id = auth.uid().
--    Un joueur lié à sa propre fiche via players.profile_id n'avait accès
--    à rien de tout ça — seuls team_players/players (l'effectif brut)
--    avaient déjà été ouverts, pour un besoin différent (fusion du
--    calendrier Coach). Cette migration ouvre partout le même deuxième
--    chemin, avec les fonctions déjà en place (is_own_player,
--    is_own_player_team, player_on_own_team) — aucune nouvelle fonction
--    nécessaire.

-- 1. events : voir les événements de sa propre équipe.
drop policy if exists "select events for own teams" on public.events;
create policy "select events for own teams"
  on public.events for select
  using (
    team_id is null
    or exists (
      select 1 from public.team_coaches tc
      where tc.team_id = events.team_id and tc.coach_id = auth.uid()
    )
    or exists (
      select 1
      from public.team_players tp
      join public.parent_player pp on pp.player_id = tp.player_id
      where tp.team_id = events.team_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player_team(events.team_id)
  );

-- 2. rsvps : voir/répondre/modifier/annuler sa propre présence.
drop policy if exists "select own or coached rsvps" on public.rsvps;
create policy "select own or coached rsvps"
  on public.rsvps for select
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
    or exists (
      select 1
      from public.events e
      join public.team_coaches tc on tc.team_id = e.team_id
      where e.id = rsvps.event_id and tc.coach_id = auth.uid()
    )
    or public.is_own_player(rsvps.player_id)
  );

drop policy if exists "insert own rsvps" on public.rsvps;
create policy "insert own rsvps"
  on public.rsvps for insert
  with check (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(rsvps.player_id)
  );

drop policy if exists "update own rsvps" on public.rsvps;
create policy "update own rsvps"
  on public.rsvps for update
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(rsvps.player_id)
  );

drop policy if exists "delete own rsvps" on public.rsvps;
create policy "delete own rsvps"
  on public.rsvps for delete
  using (
    exists (
      select 1 from public.parent_player pp
      where pp.player_id = rsvps.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(rsvps.player_id)
  );

-- 3. cotisations / cotisation_payments : voir sa propre cotisation.
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
      select 1 from public.cotisations c
      where c.id = cotisation_payments.cotisation_id
        and public.is_own_player(c.player_id)
    )
  );

-- 4. event_tasks (maillots/goûter) : voir le panneau de son équipe, se
--    porter volontaire soi-même, se désister soi-même.
drop policy if exists "select event_tasks for own context" on public.event_tasks;
create policy "select event_tasks for own context"
  on public.event_tasks for select
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1
      from public.events e
      join public.team_players tp on tp.team_id = e.team_id
      join public.parent_player pp on pp.player_id = tp.player_id
      where e.id = event_tasks.event_id and pp.parent_id = auth.uid()
    )
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_own_player_team(e.team_id)
    )
  );

drop policy if exists "assign event_tasks for own context" on public.event_tasks;
create policy "assign event_tasks for own context"
  on public.event_tasks for insert
  with check (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or (
      exists (
        select 1 from public.parent_player pp
        where pp.player_id = event_tasks.player_id and pp.parent_id = auth.uid()
      )
      and exists (
        select 1
        from public.events e
        join public.team_players tp on tp.team_id = e.team_id
        where e.id = event_tasks.event_id and tp.player_id = event_tasks.player_id
      )
    )
    or (
      public.is_own_player(event_tasks.player_id)
      and exists (
        select 1
        from public.events e
        join public.team_players tp on tp.team_id = e.team_id
        where e.id = event_tasks.event_id and tp.player_id = event_tasks.player_id
      )
    )
  );

drop policy if exists "delete event_tasks for own context" on public.event_tasks;
create policy "delete event_tasks for own context"
  on public.event_tasks for delete
  using (
    public.is_club_admin()
    or exists (
      select 1 from public.events e
      where e.id = event_tasks.event_id and public.is_team_coach(e.team_id)
    )
    or exists (
      select 1 from public.parent_player pp
      where pp.player_id = event_tasks.player_id and pp.parent_id = auth.uid()
    )
    or public.is_own_player(event_tasks.player_id)
  );

-- 5. event_carpool_offers (trajets proposés) : même logique.
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
      select 1 from public.events e
      where e.id = event_carpool_offers.event_id and public.is_own_player_team(e.team_id)
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

-- 6. event_carpool_reservations : la policy d'écriture avait déjà
--    is_own_player (ajouté au fil de 20260922), seule la lecture manquait
--    le cas "voir les réservations des trajets de sa propre équipe".
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
      where eco.id = event_carpool_reservations.offer_id
        and public.is_own_player_team(e.team_id)
    )
  );

-- 7. players / team_coaches / team_pending_coaches : un joueur lié à sa
--    propre fiche doit voir ses coéquipiers et leurs coachs, pas juste sa
--    propre ligne — même complément que celui déjà livré côté parent
--    (is_my_child_team), ici via player_on_own_team / is_own_player_team,
--    déjà en place depuis 20260903 mais jusqu'ici seulement utilisées
--    derrière un garde is_coach_anywhere().
drop policy if exists "player select teammates of own team" on public.players;
create policy "player select teammates of own team"
  on public.players for select
  using (public.player_on_own_team(players.id));

drop policy if exists "player select coaches of own team" on public.team_coaches;
create policy "player select coaches of own team"
  on public.team_coaches for select
  using (public.is_own_player_team(team_coaches.team_id));

drop policy if exists "player select pending coaches of own team" on public.team_pending_coaches;
create policy "player select pending coaches of own team"
  on public.team_pending_coaches for select
  using (public.is_own_player_team(team_pending_coaches.team_id));
