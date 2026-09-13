-- Notification "changement d'événement" (retour de Cindy du 13/09) : un
-- déclencheur SQL plutôt que du code applicatif — délibérément, contrairement
-- au reste des notifications de ce chantier — parce qu'il existe DEUX
-- chemins d'écriture sur events (create-event-form.tsx ET /api/sync-ffbb, qui
-- modifie déjà silencieusement start_time/location sans jamais prévenir
-- personne), et qu'un futur troisième chemin n'aurait aucune raison de
-- penser à rappeler une fonction JS pour rester notifié. Un trigger couvre
-- les trois sans dépendre qu'on y pense.
--
-- Se limite volontairement à start_time/impact_time/location/salle (heure,
-- heure d'arrivée, lieu, salle) + suppression (annulation) : un changement
-- de score, de notes, ou le marquage reminder_sent_at/attendance_requested_at
-- ne doit PAS déclencher de notification, ce sont des colonnes de la même
-- table mais sans rapport avec "quelque chose a changé pour toi".
create or replace function public.notify_event_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean;
  v_changes text[] := '{}';
  v_title text;
  v_body text;
  v_team_id uuid;
  v_target_team_ids uuid[];
  v_commission_ids uuid[];
  v_new_event_id uuid;
  v_group_id uuid;
begin
  -- Interrupteur Bureau unique ("Besoins bénévoles", onglet Accueil) pour
  -- les 3 notifications de ce chantier (nouveau besoin / relance J-3 /
  -- changement d'événement) — retour de Cindy du 13/09, désactivé par
  -- défaut : aucun envoi tant qu'il n'a pas été explicitement activé.
  select volunteer_need_alerts_enabled into v_enabled
  from public.club_settings where id = true;
  if not coalesce(v_enabled, false) then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    -- Un événement déjà passé qu'on nettoie de la base n'a plus besoin
    -- d'alerter qui que ce soit ("annulé" n'a de sens qu'à venir).
    if old.start_time < now() then
      return old;
    end if;
    v_title := 'Événement annulé';
    v_body := coalesce(old.title, 'Un événement') || ' du ' ||
      to_char(old.start_time at time zone 'Europe/Paris', 'DD/MM à HH24:MI') ||
      ' est annulé.';
    v_team_id := old.team_id;
    v_target_team_ids := old.target_team_ids;
    v_commission_ids := old.commission_group_ids;
    -- L'événement n'existe déjà plus au moment où ce trigger AFTER DELETE
    -- s'exécute : lui garder event_id ferait échouer l'insertion (clé
    -- étrangère vers une ligne qui vient de disparaître). null reste
    -- consultable dans l'historique (même principe que la colonne
    -- elle-même, "on delete set null").
    v_new_event_id := null;
  else
    -- Un événement déjà passé qu'on corrige a posteriori (score oublié,
    -- faute de frappe sur le lieu une fois le match joué...) n'a pas non
    -- plus de raison de prévenir qui que ce soit.
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

    -- Rien de pertinent n'a changé (score, notes, reminder_sent_at,
    -- attendance_requested_at...) : pas la peine d'écrire une notification
    -- muette.
    if array_length(v_changes, 1) is null then
      return new;
    end if;

    v_title := 'Événement modifié';
    v_body := coalesce(new.title, 'Un événement') || ' : ' || array_to_string(v_changes, ', ') || '.';
    v_team_id := new.team_id;
    v_target_team_ids := new.target_team_ids;
    v_commission_ids := new.commission_group_ids;
    v_new_event_id := new.id;
  end if;

  -- Toujours écrite, même team_id/target_team_ids tous deux null : c'est le
  -- même codage que partout ailleurs (notifications_for_me, calendar_feed_
  -- events...) pour "concerne tout le club", pas une absence de cible.
  insert into public.notifications (team_id, target_team_ids, event_id, title, body, url)
  values (v_team_id, v_target_team_ids, v_new_event_id, v_title, v_body, '/dashboard');

  -- Une ligne par commission taguée sur l'événement (tableau vide -> boucle
  -- exécutée zéro fois, rien de spécial à garder).
  foreach v_group_id in array v_commission_ids loop
    insert into public.notifications (commission_group_id, event_id, title, body)
    values (v_group_id, v_new_event_id, v_title, v_body);
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists events_notify_change on public.events;
create trigger events_notify_change
  after update or delete on public.events
  for each row execute function public.notify_event_change();
