-- Retour de Cindy du 13/11 : au clic sur "Absent", motif facultatif, vu
-- seulement par le coach (et le Bureau). Table à part plutôt qu'une colonne
-- de rsvps : les familles d'un même effectif peuvent lire les présences des
-- coéquipiers (policy "select rsvps (consolidated)") -- un motif d'absence
-- (santé, famille...) ne doit jamais leur être visible.
--
-- Écriture : mêmes droits que la présence elle-même (can_write_rsvp).
-- Lecture : Bureau, coachs de l'équipe concernée, famille du joueur, et la
-- personne qui l'a écrit. Additif, aucune donnée existante touchée.
create table if not exists public.rsvp_absence_reasons (
  event_id uuid not null references public.events(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id)
);

alter table public.rsvp_absence_reasons enable row level security;

drop policy if exists "select absence reasons" on public.rsvp_absence_reasons;
create policy "select absence reasons" on public.rsvp_absence_reasons
for select using (
  (select public.is_club_admin())
  or updated_by = (select auth.uid())
  or exists (
    select 1 from public.parent_player pp
    where pp.player_id = rsvp_absence_reasons.player_id
      and pp.parent_id = (select auth.uid())
  )
  or exists (
    select 1 from public.events e
    where e.id = rsvp_absence_reasons.event_id
      and (
        public.is_team_coach(e.team_id)
        or (
          e.target_team_ids is not null
          and exists (
            select 1 from public.team_coaches tc
            where tc.coach_id = (select auth.uid())
              and tc.team_id = any (e.target_team_ids)
          )
        )
      )
  )
);

drop policy if exists "insert absence reasons" on public.rsvp_absence_reasons;
create policy "insert absence reasons" on public.rsvp_absence_reasons
for insert with check (public.can_write_rsvp(event_id, player_id));

drop policy if exists "update absence reasons" on public.rsvp_absence_reasons;
create policy "update absence reasons" on public.rsvp_absence_reasons
for update using (public.can_write_rsvp(event_id, player_id))
with check (public.can_write_rsvp(event_id, player_id));

drop policy if exists "delete absence reasons" on public.rsvp_absence_reasons;
create policy "delete absence reasons" on public.rsvp_absence_reasons
for delete using (public.can_write_rsvp(event_id, player_id));

grant select, insert, update, delete on public.rsvp_absence_reasons to authenticated;
