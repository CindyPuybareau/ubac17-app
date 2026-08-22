-- Suivi des sponsors du club, réservé au Bureau (retour de Cindy du
-- 2026-08-22 : remplace la carte "Documents à renouveler" du tableau de
-- bord Bureau par un vrai suivi "Renouvellement Sponsors" — cette table
-- n'existait pas du tout avant, contrairement aux licences/certificats
-- médicaux qui étaient déjà suivis sur players).
create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  -- Date à laquelle le contrat/partenariat doit être renouvelé — nullable :
  -- un sponsor peut être ajouté avant que cette date soit connue/négociée.
  renewal_date date,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.sponsors enable row level security;

-- Même périmètre que collectes/cotisations/club_administrators : réservé au
-- Bureau, aucun intérêt Coach/Famille (pas de lien avec une équipe ou un
-- joueur).
create policy "admin manage sponsors"
  on public.sponsors
  for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.sponsors to authenticated;
