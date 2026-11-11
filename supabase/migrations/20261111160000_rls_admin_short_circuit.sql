-- Audit performance du 11/11 (Bureau : lecture des présences jusqu'à 4,2 s,
-- 660 ms en moyenne, pour ~1 800 lignes). Cause : sur ces 14 tables, la
-- règle Bureau ("admin manage ...", is_club_admin()) n'était évaluée
-- qu'APRÈS toutes les sous-requêtes Coach/Famille de la règle SELECT, et
-- ligne par ligne -- un compte Bureau payait pour chaque ligne tout le
-- travail des autres rôles avant d'arriver à "oui, Bureau".
--
-- Correctif purement de performance, sans aucun changement de droits :
-- "(select public.is_club_admin()) or (<règle existante, inchangée>)".
--   - Bureau : la sous-requête est calculée UNE fois par requête (InitPlan),
--     vraie -> toutes les lignes passent immédiatement. Le Bureau voyait
--     déjà tout via "admin manage ..." / is_club_admin(), rien de plus.
--   - Coach/Famille/Joueur : fausse, calculée une fois -> la règle existante
--     s'applique exactement comme avant.
-- Mesuré avant application (transaction annulée) : 1 375 ms -> 47 ms pour
-- la lecture Bureau des présences, et nombre de lignes visibles identique
-- avant/après, pour un compte Bureau comme pour un compte non-Bureau.
-- Le texte de chaque règle existante est repris tel quel depuis pg_policies.

alter policy "select own linked cotisation_payments" on public.cotisation_payments using ((select public.is_club_admin()) or (((EXISTS ( SELECT 1
   FROM (cotisations c
     JOIN parent_player pp ON ((pp.player_id = c.player_id)))
  WHERE ((c.id = cotisation_payments.cotisation_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM cotisations c
  WHERE ((c.id = cotisation_payments.cotisation_id) AND is_own_player(c.player_id)))))));

alter policy "select own linked cotisations" on public.cotisations using ((select public.is_club_admin()) or (((EXISTS ( SELECT 1
   FROM parent_player pp
  WHERE ((pp.player_id = cotisations.player_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR is_own_player(player_id))));

alter policy "select carpool offers for own context" on public.event_carpool_offers using ((select public.is_club_admin()) or ((is_club_admin() OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_carpool_offers.event_id) AND is_team_coach(e.team_id)))) OR (EXISTS ( SELECT 1
   FROM ((events e
     JOIN team_players tp ON ((tp.team_id = e.team_id)))
     JOIN parent_player pp ON ((pp.player_id = tp.player_id)))
  WHERE ((e.id = event_carpool_offers.event_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (events e
     JOIN team_players tp ON ((tp.team_id = e.team_id)))
  WHERE ((e.id = event_carpool_offers.event_id) AND is_own_player(tp.player_id)))))));

alter policy "select carpool reservations for own context" on public.event_carpool_reservations using ((select public.is_club_admin()) or ((is_club_admin() OR (EXISTS ( SELECT 1
   FROM (event_carpool_offers eco
     JOIN events e ON ((e.id = eco.event_id)))
  WHERE ((eco.id = event_carpool_reservations.offer_id) AND is_team_coach(e.team_id)))) OR (EXISTS ( SELECT 1
   FROM (((event_carpool_offers eco
     JOIN events e ON ((e.id = eco.event_id)))
     JOIN team_players tp ON ((tp.team_id = e.team_id)))
     JOIN parent_player pp ON ((pp.player_id = tp.player_id)))
  WHERE ((eco.id = event_carpool_reservations.offer_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM ((event_carpool_offers eco
     JOIN events e ON ((e.id = eco.event_id)))
     JOIN team_players tp ON ((tp.team_id = e.team_id)))
  WHERE ((eco.id = event_carpool_reservations.offer_id) AND is_own_player(tp.player_id)))))));

alter policy "select event_tasks for own context" on public.event_tasks using ((select public.is_club_admin()) or ((is_club_admin() OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_tasks.event_id) AND is_team_coach(e.team_id)))) OR (EXISTS ( SELECT 1
   FROM ((events e
     JOIN team_players tp ON ((tp.team_id = e.team_id)))
     JOIN parent_player pp ON ((pp.player_id = tp.player_id)))
  WHERE ((e.id = event_tasks.event_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (events e
     JOIN team_players tp ON ((tp.team_id = e.team_id)))
  WHERE ((e.id = event_tasks.event_id) AND is_own_player(tp.player_id)))))));

alter policy "select volunteer needs for visible events" on public.event_volunteer_needs using ((select public.is_club_admin()) or ((EXISTS ( SELECT 1
   FROM events e
  WHERE (e.id = event_volunteer_needs.event_id)))));

alter policy "select volunteer signups for visible needs" on public.event_volunteer_signups using ((select public.is_club_admin()) or ((EXISTS ( SELECT 1
   FROM event_volunteer_needs n
  WHERE (n.id = event_volunteer_signups.need_id)))));

alter policy "select events (consolidated)" on public.events using ((select public.is_club_admin()) or ((is_club_admin() OR ((team_id IS NULL) AND (target_team_ids IS NULL) AND (event_type <> 'REUNION'::text)) OR ((team_id IS NULL) AND (target_team_ids IS NULL) AND (event_type = 'REUNION'::text) AND (restricted_audience = 'COACHS'::text) AND is_coach_anywhere()) OR is_team_coach(team_id) OR is_own_player_team(team_id) OR (EXISTS ( SELECT 1
   FROM (team_players tp
     JOIN parent_player pp ON ((pp.player_id = tp.player_id)))
  WHERE ((tp.team_id = events.team_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR ((target_team_ids IS NOT NULL) AND ((EXISTS ( SELECT 1
   FROM team_coaches tc
  WHERE ((tc.coach_id = ( SELECT auth.uid() AS uid)) AND (tc.team_id = ANY (events.target_team_ids))))) OR (EXISTS ( SELECT 1
   FROM (team_players tp2
     JOIN players pl ON ((pl.id = tp2.player_id)))
  WHERE ((tp2.team_id = ANY (events.target_team_ids)) AND (pl.profile_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (team_players tp3
     JOIN parent_player pp2 ON ((pp2.player_id = tp3.player_id)))
  WHERE ((tp3.team_id = ANY (events.target_team_ids)) AND (pp2.parent_id = ( SELECT auth.uid() AS uid))))))) OR ((target_profile_ids IS NOT NULL) AND (( SELECT auth.uid() AS uid) = ANY (target_profile_ids))) OR ((event_type = ANY (ARRAY['MATCH'::text, 'FRIENDLY'::text])) AND (( SELECT auth.uid() AS uid) IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
   FROM teams t
  WHERE ((t.id = events.team_id) AND t.is_demo))))))));

alter policy "select match officials for visible events" on public.match_official_roles using ((select public.is_club_admin()) or ((EXISTS ( SELECT 1
   FROM events e
  WHERE (e.id = match_official_roles.event_id)))));

alter policy "select parent_player (consolidated)" on public.parent_player using ((select public.is_club_admin()) or (((parent_id = ( SELECT auth.uid() AS uid)) OR player_on_coached_team(player_id) OR (is_coach_anywhere() AND player_on_own_team(player_id)))));

alter policy "select penalites (consolidated)" on public.penalites using ((select public.is_club_admin()) or (((EXISTS ( SELECT 1
   FROM team_players tp
  WHERE ((tp.player_id = penalites.player_id) AND is_team_coach(tp.team_id)))) OR (EXISTS ( SELECT 1
   FROM parent_player pp
  WHERE ((pp.player_id = penalites.player_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR is_own_player(player_id))));

alter policy "select players (consolidated)" on public.players using ((select public.is_club_admin()) or (((profile_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM parent_player pp
  WHERE ((pp.player_id = players.id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM (team_players tp
     JOIN team_coaches tc ON ((tc.team_id = tp.team_id)))
  WHERE ((tp.player_id = players.id) AND (tc.coach_id = ( SELECT auth.uid() AS uid))))) OR ((profile_id IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM team_coaches tc
  WHERE ((tc.coach_id = players.profile_id) AND is_team_coach(tc.team_id))))) OR (EXISTS ( SELECT 1
   FROM team_pending_coaches tpc
  WHERE ((tpc.player_id = players.id) AND is_team_coach(tpc.team_id)))) OR (is_coach_anywhere() AND player_on_own_team(id)) OR is_pending_coach_of_my_child_team(id))));

alter policy "select rsvps (consolidated)" on public.rsvps using ((select public.is_club_admin()) or (((EXISTS ( SELECT 1
   FROM parent_player pp
  WHERE ((pp.player_id = rsvps.player_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = rsvps.event_id) AND (is_team_coach(e.team_id) OR ((e.target_team_ids IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM team_coaches tc
          WHERE ((tc.coach_id = ( SELECT auth.uid() AS uid)) AND (tc.team_id = ANY (e.target_team_ids)))))))))) OR is_teammate_of_my_child(player_id) OR player_on_own_team(player_id))));

alter policy "select team_players for own context" on public.team_players using ((select public.is_club_admin()) or (((EXISTS ( SELECT 1
   FROM team_coaches tc
  WHERE ((tc.team_id = team_players.team_id) AND (tc.coach_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM parent_player pp
  WHERE ((pp.player_id = team_players.player_id) AND (pp.parent_id = ( SELECT auth.uid() AS uid))))) OR is_own_player(player_id) OR (is_coach_anywhere() AND is_own_player_team(team_id)) OR is_my_child_team(team_id))));
