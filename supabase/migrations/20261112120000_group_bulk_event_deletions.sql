-- Retour de Cindy du 12/11 (audit visuel) : le 30/10, la réimportation du
-- planning des entraînements a supprimé d'un coup les anciennes séances --
-- et ce déclencheur a écrit une notification "Événement annulé" PAR séance
-- supprimée : 327 en une minute dans la cloche des familles, alors que rien
-- n'était réellement annulé (le planning était simplement remplacé).
--
-- Désormais, pour une suppression : si une notification de suppression
-- pour la MÊME équipe (même portée) a déjà été écrite dans les 2 dernières
-- minutes, on la complète au lieu d'en ajouter une nouvelle --
-- "Planning mis à jour : 12 événements retirés du planning." Une vraie
-- annulation isolée reste notifiée exactement comme avant ("Entraînement du
-- 14/11 à 16:30 est annulé."). Les modifications d'horaire/lieu ne changent
-- pas.
--
-- Aucune donnée existante touchée : seule la façon d'écrire les PROCHAINES
-- notifications de suppression change.
create or replace function public.notify_event_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_enabled boolean;
  v_changes text[] := '{}';
  v_title text;
  v_body text;
  v_team_id uuid;
  v_target_team_ids uuid[];
  v_target_profile_ids uuid[];
  v_commission_ids uuid[];
  v_new_event_id uuid;
  v_group_id uuid;
  v_event_type text;
  v_restricted_audience text;
  v_recent_id uuid;
  v_recent_title text;
  v_recent_body text;
  v_count integer;
begin
  select volunteer_need_alerts_enabled into v_enabled
  from public.club_settings where id = true;
  if not coalesce(v_enabled, false) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.start_time < now() then
      return old;
    end if;

    -- Suppressions en série (12/11) : regroupées dans une seule notification
    -- par équipe/portée, sur une fenêtre de 2 minutes.
    select n.id, n.title, n.body into v_recent_id, v_recent_title, v_recent_body
    from public.notifications n
    where n.title in ('Événement annulé', 'Planning mis à jour')
      and n.event_id is null
      and n.commission_group_id is null
      and n.team_id is not distinct from old.team_id
      and n.target_team_ids is not distinct from old.target_team_ids
      and n.target_profile_ids is not distinct from old.target_profile_ids
      and n.created_at > now() - interval '2 minutes'
    order by n.created_at desc
    limit 1;

    if v_recent_id is not null then
      if v_recent_title = 'Planning mis à jour' then
        v_count := coalesce(substring(v_recent_body from '([0-9]+) événements')::integer, 1) + 1;
      else
        v_count := 2;
      end if;
      update public.notifications
      set title = 'Planning mis à jour',
          body = v_count || ' événements retirés du planning. Consulte le calendrier pour voir les séances à jour.'
      where id = v_recent_id;
      return old;
    end if;

    v_title := 'Événement annulé';
    v_body := coalesce(old.title, 'Un événement') || ' du ' ||
      to_char(old.start_time at time zone 'Europe/Paris', 'DD/MM à HH24:MI') ||
      ' est annulé.';
    v_team_id := old.team_id;
    v_target_team_ids := old.target_team_ids;
    v_target_profile_ids := old.target_profile_ids;
    v_commission_ids := old.commission_group_ids;
    v_event_type := old.event_type;
    v_restricted_audience := old.restricted_audience;
    v_new_event_id := null;
  else
    if new.start_time < now() then
      return new;
    end if;

    if new.start_time is distinct from old.start_time then
      v_changes := v_changes || ('nouvelle heure : ' ||
        to_char(new.start_time at time zone 'Europe/Paris', 'DD/MM à HH24:MI'));
    end if;
    if new.impact_time is distinct from old.impact_time then
      v_changes := v_changes || ('nouvelle heure d''arrivée : ' ||
        to_char(new.impact_time at time zone 'Europe/Paris', 'HH24:MI'));
    end if;
    if new.location is distinct from old.location then
      v_changes := v_changes || ('nouveau lieu : ' || coalesce(new.location, '—'));
    end if;
    if new.salle is distinct from old.salle then
      v_changes := v_changes || ('nouvelle salle : ' || coalesce(new.salle, '—'));
    end if;

    if array_length(v_changes, 1) is null then
      return new;
    end if;

    v_title := 'Événement modifié';
    v_body := coalesce(new.title, 'Un événement') || ' : ' || array_to_string(v_changes, ', ') || '.';
    v_team_id := new.team_id;
    v_target_team_ids := new.target_team_ids;
    v_target_profile_ids := new.target_profile_ids;
    v_commission_ids := new.commission_group_ids;
    v_event_type := new.event_type;
    v_restricted_audience := new.restricted_audience;
    v_new_event_id := new.id;
  end if;

  insert into public.notifications (team_id, target_team_ids, target_profile_ids, event_id, title, body, url, restricted_audience)
  values (
    v_team_id, v_target_team_ids, v_target_profile_ids, v_new_event_id, v_title, v_body, '/dashboard',
    case when v_team_id is null and v_target_team_ids is null and v_event_type = 'REUNION'
      then v_restricted_audience
      else null
    end
  );

  foreach v_group_id in array v_commission_ids loop
    insert into public.notifications (commission_group_id, event_id, title, body)
    values (v_group_id, v_new_event_id, v_title, v_body);
  end loop;

  return coalesce(new, old);
end;
$function$;
