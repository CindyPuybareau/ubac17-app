-- Retour de Cindy du 13/09 ("étendre le système de notifications... besoins
-- bénévoles") : socle de données pour 3 nouvelles alertes (nouveau besoin,
-- relance J-3, changement d'événement) — voir aussi
-- 20261113010000_notify_event_change_trigger.sql pour le déclencheur SQL.
--
-- Ciblage retenu après discussion : le côté équipe (team_id/target_team_ids,
-- déjà utilisé partout) ne change pas. Le côté "commission concernée" NE
-- cible PAS des personnes individuelles : sur 9 commissions du club, une
-- seule a un bénévole rattaché en base (vérifié le 13/09) — les 8 autres
-- (Bureau, Coachs UBAC, Comité directeur...) n'ont tout simplement aucune
-- liste de membres exploitable par l'appli, ce sont de vrais comptes sans
-- lien table-à-table vers leur(s) commission(s). La notification est donc
-- posée sur l'ESPACE PARTAGÉ de la commission (son lien /commission/[token],
-- déjà l'identité de toute la commission pour "Besoins bénévoles"), pas sur
-- une liste de destinataires.

-- Interrupteur Bureau (onglet Accueil, "Envois automatiques") — même
-- convention que les 3 existants (match_reminder_enabled...), désactivé par
-- défaut : aucun envoi tant que le Bureau ne l'a pas explicitement activé.
alter table public.club_settings
  add column if not exists volunteer_need_alerts_enabled boolean not null default false;

-- Dédoublonnage de la relance J-3 (même principe que events.reminder_sent_at
-- pour les rappels de match) : une fois posé, ce besoin ne sera plus jamais
-- relancé, même s'il reste non pourvu.
alter table public.event_volunteer_needs
  add column if not exists reminder_sent_at timestamptz;

-- Nouvelle portée pour la table notifications, à côté de team_id/
-- target_team_ids (équipe) et benevole_id (bénévole individuel, orphelin
-- depuis la suppression des invitations individuelles le 13/09) : une
-- notification pour TOUTE une commission, lue par /commission/[token] sans
-- session (comme le reste de cette page, via service_role) — jamais par
-- notifications_for_me()/auth.uid(), un compte Bureau/Coach classique n'a
-- aucune raison de voir une alerte "commission".
alter table public.notifications
  add column if not exists commission_group_id uuid references public.whatsapp_groups(id) on delete cascade;

create index if not exists notifications_commission_group_id_idx
  on public.notifications (commission_group_id) where commission_group_id is not null;

-- Étend la policy d'écriture existante : la notification "nouveau besoin"
-- (posée en code applicatif, pas par un trigger — voir son commentaire dans
-- event-volunteer-needs.ts) est écrite par le même compte authentifié
-- (Bureau ou coach) qui vient de créer le besoin, avec le même garde-fou que
-- les branches team_id/benevole_id déjà en place : autorisé seulement si
-- Bureau, ou si coach de l'équipe de l'événement concerné.
drop policy if exists "coach or admin can log notifications" on public.notifications;
create policy "coach or admin can log notifications"
  on public.notifications for insert
  with check (
    (team_id is null and benevole_id is null and commission_group_id is null and public.is_club_admin())
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
    or (
      commission_group_id is not null
      and (
        public.is_club_admin()
        or exists (
          select 1 from public.events e
          where e.id = notifications.event_id and public.is_team_coach(e.team_id)
        )
      )
    )
  );
