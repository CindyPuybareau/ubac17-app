-- Retour de Cindy du 12/11 ("vérifier le délai de présent/absent... voir si
-- la réactivité est bonne") : un enregistrement Présent/Absent prenait
-- 110 à 180 ms côté base -- dont ~120 ms rien que pour PRÉPARER la
-- vérification des droits : les règles d'écriture de rsvps interrogeaient
-- `events` sous ses propres règles d'accès, elles-mêmes imbriquées (plan
-- de plus de 1 500 sous-requêtes pour une seule ligne).
--
-- Correctif purement de performance : la même condition, regroupée dans
-- une fonction security definer (can_write_rsvp) qui lit events/
-- parent_player directement. Mesuré (transaction annulée) : ~68 ms au lieu
-- de 110-180 ms.
--
-- Droits STRICTEMENT identiques, vérifiés avant application (transaction
-- annulée) sur 2 378 couples événement/joueur pour 5 types de compte
-- (Bureau, parent, coach, joueur, compte sans lien) : 0 écart. La
-- condition reprend mot pour mot les règles "insert/update/delete rsvps
-- (consolidated)" + la règle Bureau "admin manage rsvps" :
--   Bureau, OU coach de l'équipe de l'événement, OU parent du joueur,
--   OU le joueur lui-même.
-- La règle de LECTURE (select rsvps) n'est pas modifiée.

create or replace function public.can_write_rsvp(p_event_id uuid, p_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.is_club_admin()
    or exists (select 1 from public.events e where e.id = p_event_id and public.is_team_coach(e.team_id))
    or exists (select 1 from public.parent_player pp where pp.player_id = p_player_id and pp.parent_id = auth.uid())
    or public.is_own_player(p_player_id);
$function$;

revoke all on function public.can_write_rsvp(uuid, uuid) from public, anon;
grant execute on function public.can_write_rsvp(uuid, uuid) to authenticated;

alter policy "insert rsvps (consolidated)" on public.rsvps
  with check (public.can_write_rsvp(event_id, player_id));

alter policy "update rsvps (consolidated)" on public.rsvps
  using (public.can_write_rsvp(event_id, player_id))
  with check (public.can_write_rsvp(event_id, player_id));

alter policy "delete rsvps (consolidated)" on public.rsvps
  using (public.can_write_rsvp(event_id, player_id));
