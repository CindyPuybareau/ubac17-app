-- Retour de Cindy du 25/10 ("ajouter un onglet Buvette dans Paiements, pour
-- que le comptable puisse saisir tel jour : X € en CB/Sumup, X € en
-- espèces") : nouveau suivi financier simple, Bureau seul, indépendant des
-- cotisations/collectes/pénalités -- même patron que sponsors.sql (table
-- sans joueur ni coach, RLS is_club_admin() seule).
create table if not exists public.buvette_entries (
  id uuid primary key default gen_random_uuid(),
  buvette_date date not null,
  card_amount numeric not null default 0,
  cash_amount numeric not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.buvette_entries enable row level security;

create policy "admin manage buvette_entries"
  on public.buvette_entries
  for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.buvette_entries to authenticated;
