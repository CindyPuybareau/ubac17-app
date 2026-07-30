-- "Collectes" (Stages & Événements payants): a paid collection campaign the
-- Bureau can create outside the regular season cotisation (Stage Toussaint,
-- tournoi, boutique...), with participants tracked the same way as season
-- cotisations (via cotisations.collecte_id).
create table if not exists public.collectes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('STAGE', 'EVENEMENT', 'BOUTIQUE')),
  prix numeric,
  created_at timestamptz not null default now()
);

alter table public.collectes enable row level security;

-- Non-sensitive (just a campaign name/type/price), readable club-wide like
-- teams; only the Bureau can create/edit/delete one.
drop policy if exists "select all collectes" on public.collectes;
create policy "select all collectes"
  on public.collectes for select
  using (true);

drop policy if exists "admin manage collectes" on public.collectes;
create policy "admin manage collectes"
  on public.collectes for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.collectes to authenticated;

-- Null collecte_id = a regular season cotisation (unchanged behavior); set
-- = a participant in one of the Bureau's stage/event/boutique collectes.
alter table public.cotisations
  add column if not exists collecte_id uuid references public.collectes(id) on delete cascade;
