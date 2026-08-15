-- Interrupteur explicite pour les relances automatiques de cotisation :
-- Cindy doit pouvoir décider elle-même quand ce mécanisme démarre plutôt
-- que le laisser s'activer tout seul dès que le cooldown expire. Une seule
-- ligne (singleton, id verrouillé à true) — même esprit qu'un
-- "app_settings" minimal, pas besoin de plus pour un seul réglage.
create table if not exists public.club_settings (
  id boolean primary key default true,
  cotisation_relance_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint club_settings_singleton check (id)
);

insert into public.club_settings (id, cotisation_relance_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.club_settings enable row level security;

drop policy if exists "admin read club_settings" on public.club_settings;
create policy "admin read club_settings" on public.club_settings
  for select using (is_club_admin());

drop policy if exists "admin manage club_settings" on public.club_settings;
create policy "admin manage club_settings" on public.club_settings
  for update using (is_club_admin()) with check (is_club_admin());

grant select, update on public.club_settings to authenticated;
