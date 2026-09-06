-- Retour de Cindy du 06/09 ("ajouter aux bénévoles les notifications comme
-- pour tous les autres espaces, quand un événement les concerne") : même
-- principe que l'Espace Enfant (20260817000000_notifications.sql) --
-- aucune session Supabase Auth côté bénévole, donc pas de auth.uid() ni de
-- notifications_for_me() possible. Contrairement à un enfant (notifié par
-- équipe), un bénévole est notifié individuellement : c'est SON invitation
-- précise à UN événement qui déclenche l'alerte, jamais un ciblage par
-- équipe (les bénévoles n'en ont pas).
alter table public.notifications
  add column benevole_id uuid references public.benevoles(id) on delete cascade;

alter table public.notification_reads
  add column benevole_id uuid references public.benevoles(id) on delete cascade;

alter table public.notification_reads
  drop constraint notification_reads_one_recipient;
alter table public.notification_reads
  add constraint notification_reads_one_recipient check (
    (profile_id is not null and player_id is null and benevole_id is null) or
    (profile_id is null and player_id is not null and benevole_id is null) or
    (profile_id is null and player_id is null and benevole_id is not null)
  );

create unique index if not exists notification_reads_benevole_uniq
  on public.notification_reads (notification_id, benevole_id) where benevole_id is not null;

-- Étend la policy d'écriture existante : un bénévole notifié via
-- benevole_id suit la même règle qu'une invitation elle-même (Bureau pour
-- tout événement, coach seulement pour ceux de sa propre équipe) --
-- retour de Cindy du 06/09, "bureau et coachs" peuvent tous les deux
-- inviter un bénévole (voir 20261031180000_coach_manage_event_benevole_
-- invites.sql).
drop policy if exists "coach or admin can log notifications" on public.notifications;
create policy "coach or admin can log notifications"
  on public.notifications for insert
  with check (
    (team_id is null and benevole_id is null and public.is_club_admin())
    or (team_id is not null and (public.is_club_admin() or public.is_team_coach(team_id)))
    or (
      benevole_id is not null
      and (
        public.is_club_admin()
        or exists (
          select 1 from public.events e
          where e.id = notifications.event_id and public.is_team_coach(e.team_id)
        )
      )
    )
  );

-- Même interrupteur "recevoir les notifications" que côté enfant
-- (players.notifications_enabled) -- actif par défaut.
alter table public.benevoles
  add column notifications_enabled boolean not null default true;
