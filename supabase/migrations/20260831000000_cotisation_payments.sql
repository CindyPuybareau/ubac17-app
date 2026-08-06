-- Split/multi-payment history per cotisation (ex: Chèque 1 de 60€, Chèque
-- 2 de 60€, Chèque 3 de 60€ + Pass Sport de 50€), instead of the single
-- "paiement" column being overwritten each time. cotisations.paiement
-- stays as the running total (kept in sync by the app on every insert),
-- so every existing reader (KPIs, exports, reçus) keeps working
-- unchanged — this table is purely the itemised history behind that total.
create table if not exists public.cotisation_payments (
  id uuid primary key default gen_random_uuid(),
  cotisation_id uuid not null references public.cotisations(id) on delete cascade,
  amount numeric not null,
  mode text not null,
  -- Free-text: chèque number, bank, or any other note — kept as a single
  -- flexible field rather than rigid columns, matching medical_notes /
  -- other_notes elsewhere in this schema.
  detail text,
  expected_cash_date date,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.cotisation_payments enable row level security;

drop policy if exists "admin manage cotisation_payments" on public.cotisation_payments;
create policy "admin manage cotisation_payments"
  on public.cotisation_payments for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

-- Same "a parent can see their own child's records" pattern as
-- cotisations itself, so a future parent-facing payment history view
-- (not built yet) doesn't need a separate migration to unlock read access.
drop policy if exists "select own linked cotisation_payments" on public.cotisation_payments;
create policy "select own linked cotisation_payments"
  on public.cotisation_payments for select
  using (
    exists (
      select 1
      from public.cotisations c
      join public.parent_player pp on pp.player_id = c.player_id
      where c.id = cotisation_payments.cotisation_id and pp.parent_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.cotisation_payments to authenticated;
