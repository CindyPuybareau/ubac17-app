-- Retour de Cindy du 16/10 ("Vie du club... un onglet Inventaire") : liste
-- libre de matériel club (nom + quantité), visible ET modifiable par le
-- Bureau ET les coachs (club entier -- le matériel n'est jamais rattaché à
-- une équipe précise), jamais par Famille/Enfant/Bénévole.
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quantity integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.inventory_items enable row level security;

create policy "bureau and coach manage inventory_items"
  on public.inventory_items
  for all
  using (public.is_club_admin() or public.is_coach_anywhere())
  with check (public.is_club_admin() or public.is_coach_anywhere());

grant select, insert, update, delete on public.inventory_items to authenticated;
