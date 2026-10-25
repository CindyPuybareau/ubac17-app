-- Rattrapage du bug Léonie Lamouret (cotisation manquante malgré présence) :
-- quand sync_paid_event_cotisation_on_rsvp (cotisations_added_manually.sql)
-- se déclenche sur le RSVP AVANT que la collecte EVENEMENT ne soit liée à
-- l'événement (fenêtre de 8 minutes observée en production), aucune
-- collecte n'existe encore pour l'event_id -- la fonction ne fait rien, et
-- aucun autre déclencheur ne revient dessus ensuite. Celui-ci couvre
-- l'autre sens : quand une collecte se lie (ou change de lien) à un
-- événement, rattrape en un seul INSERT groupé les RSVP déjà PRESENT/LATE
-- sur cet événement qui n'ont pas encore de ligne cotisations.
--
-- Appliquée en direct par Cindy via le SQL Editor Supabase le 2026-10-20
-- (les tentatives via apply_migration/execute_sql ont été bloquées par le
-- classifieur de permissions malgré son autorisation explicite) -- ce
-- fichier trace la définition exactement telle qu'elle existe en base,
-- pour garder l'historique des migrations cohérent avec la base live.
create or replace function public.backfill_cotisations_on_collecte_event_link()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.event_id is null or new.type <> 'EVENEMENT' then
    return new;
  end if;

  insert into public.cotisations (player_id, guest_name, collecte_id, saison, prix, remise, paiement, statut)
  select r.player_id, r.guest_name, new.id, new.name, new.prix, 0, 0, null
  from public.rsvps r
  where r.event_id = new.event_id
    and r.status in ('PRESENT', 'LATE')
    and (r.player_id is not null or r.guest_name is not null)
    and not exists (
      select 1 from public.cotisations co
      where co.collecte_id = new.id
        and (
          (r.player_id is not null and co.player_id = r.player_id)
          or (r.player_id is null and r.guest_name is not null and co.guest_name = r.guest_name)
        )
    );

  return new;
end;
$function$;

drop trigger if exists backfill_cotisations_on_collecte_event_link on public.collectes;

create trigger backfill_cotisations_on_collecte_event_link
  after insert or update of event_id, type on public.collectes
  for each row execute function public.backfill_cotisations_on_collecte_event_link();
