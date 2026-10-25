-- Retour de Cindy du 25/10 ("le comptable n'a pas trouvé comment ajouter
-- un participant à un événement payant qui ne s'est pas noté présent") :
-- added_manually distingue une ligne cotisations créée à la main (Bureau,
-- "Ajouter des participants") d'une ligne créée automatiquement par
-- sync_paid_event_cotisation_on_rsvp (quand quelqu'un clique Présent).
-- Sert à deux endroits côté appli : ne jamais la cacher du tableau
-- (visibleCollecteCotisations, cotisations-manager.tsx) et, ici, ne
-- jamais la supprimer si le RSVP de la personne change ensuite -- même
-- garde-fou que celui déjà en place pour un statut "Offert".
alter table public.cotisations add column if not exists added_manually boolean not null default false;

create or replace function public.sync_paid_event_cotisation_on_rsvp()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_collecte record;
  v_existing record;
  v_event_id uuid;
  v_player_id uuid;
  v_guest_name text;
  v_status text;
begin
  if TG_OP = 'DELETE' then
    v_event_id := old.event_id;
    v_player_id := old.player_id;
    v_guest_name := old.guest_name;
    v_status := null;
  else
    v_event_id := new.event_id;
    v_player_id := new.player_id;
    v_guest_name := new.guest_name;
    v_status := new.status;
  end if;

  select id, name, prix into v_collecte
  from public.collectes
  where event_id = v_event_id and type = 'EVENEMENT'
  limit 1;

  if v_collecte.id is null then
    return coalesce(new, old);
  end if;

  if v_player_id is not null then
    select id, paiement, statut, added_manually into v_existing
    from public.cotisations
    where collecte_id = v_collecte.id and player_id = v_player_id
    limit 1;
  elsif v_guest_name is not null then
    select id, paiement, statut, added_manually into v_existing
    from public.cotisations
    where collecte_id = v_collecte.id and guest_name = v_guest_name
    limit 1;
  else
    v_existing := null;
  end if;

  if v_status = 'PRESENT' or v_status = 'LATE' then
    if v_existing.id is null and (v_player_id is not null or v_guest_name is not null) then
      insert into public.cotisations (player_id, guest_name, collecte_id, saison, prix, remise, paiement, statut)
      values (v_player_id, v_guest_name, v_collecte.id, v_collecte.name, v_collecte.prix, 0, 0, null);
    end if;
  else
    -- added_manually distinct from true (jamais = false tout court) :
    -- la colonne est NOT NULL mais on reste explicite/robuste au cas où
    -- une future ligne la laisserait null par erreur -- ne jamais
    -- supprimer dans le doute plutôt que l'inverse.
    if v_existing.id is not null
       and coalesce(v_existing.paiement, 0) = 0
       and v_existing.statut is distinct from 'OFFERT'
       and v_existing.added_manually is distinct from true
    then
      delete from public.cotisations where id = v_existing.id;
    end if;
  end if;

  return coalesce(new, old);
end;
$function$;
