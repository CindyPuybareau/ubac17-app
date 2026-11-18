-- Retour de Cindy du 18/11 ("si j'étais comptable") : deux suivis d'argent
-- tenus jusqu'ici à la main dans le fichier du Bureau, colonnes "Pass
-- et/ou Chèque Sport" / "Statut Pass et/ou Sport" et "Remboursement".
-- Ajout seul (règle n°1) : aucune donnée existante modifiée. Réservé au
-- Bureau, comme l'écriture des règlements (cotisation_payments).

-- Aides Pass'Sport (PS) et Coupons Sport ANCV (CS) : l'argent vient de
-- l'État / de l'ANCV, à condition de DÉCLARER le code -- à déclarer ->
-- déclarée (n° de lot, "Enregistré (14)" dans le fichier) -> reçue.
create table if not exists public.cotisation_aids (
  id uuid primary key default gen_random_uuid(),
  cotisation_id uuid not null references public.cotisations(id) on delete cascade,
  kind text not null check (kind in ('PASS_SPORT', 'ANCV')),
  code text,
  amount numeric check (amount is null or amount >= 0),
  status text not null default 'A_DECLARER' check (status in ('A_DECLARER', 'DECLAREE', 'RECUE')),
  batch text,
  status_changed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Réimport du fichier : une même aide (même code) n'est jamais créée deux
  -- fois. Les codes vides restent libres (saisie dans l'appli sans code).
  constraint cotisation_aids_unique_code unique (cotisation_id, kind, code)
);

-- Remboursements ("À faire : 160 € (attente RIB)", "Fait : 15 €").
create table if not exists public.cotisation_refunds (
  id uuid primary key default gen_random_uuid(),
  cotisation_id uuid not null references public.cotisations(id) on delete cascade,
  amount numeric not null check (amount > 0),
  reason text,
  rib_received boolean not null default false,
  status text not null default 'A_FAIRE' check (status in ('A_FAIRE', 'FAIT')),
  done_at date,
  -- 'fichier' pour la ligne reprise de la colonne "Remboursement" du
  -- fichier du Bureau (une seule par cotisation, mise à jour au réimport) ;
  -- null pour un remboursement saisi dans l'appli.
  import_key text,
  created_at timestamptz not null default now(),
  constraint cotisation_refunds_unique_import unique (cotisation_id, import_key)
);

create index if not exists cotisation_aids_cotisation_idx on public.cotisation_aids (cotisation_id);
create index if not exists cotisation_refunds_cotisation_idx on public.cotisation_refunds (cotisation_id);

alter table public.cotisation_aids enable row level security;
alter table public.cotisation_refunds enable row level security;

create policy "admin manage cotisation_aids" on public.cotisation_aids
  for all using ((select public.is_club_admin())) with check ((select public.is_club_admin()));

create policy "admin manage cotisation_refunds" on public.cotisation_refunds
  for all using ((select public.is_club_admin())) with check ((select public.is_club_admin()));

grant select, insert, update, delete on public.cotisation_aids to authenticated;
grant select, insert, update, delete on public.cotisation_refunds to authenticated;

alter publication supabase_realtime add table public.cotisation_aids;
alter publication supabase_realtime add table public.cotisation_refunds;
