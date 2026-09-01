-- Comptes rendus (retour de Cindy du 2026-09-01) : mairies, Bureau, coachs
-- (texte simple, redige dans l'appli) + un 4e type prevu mais pas encore
-- construit (CD17_LIGUE, un vrai fichier depose par le Bureau, verrouille
-- apres depot -- viendra dans une prochaine migration avec son bucket de
-- stockage, volontairement "en dernier").
--
-- Choix explicite de Cindy : du texte plutot que des fichiers pour ces 3
-- categories (aucun cout de stockage, contrairement a un PDF/Word depose),
-- exportable en PDF a la demande pour impression (comme les factures).
create table if not exists public.club_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('MAIRIE', 'BUREAU', 'COACH', 'CD17_LIGUE')),
  title text not null,
  report_date date not null default current_date,
  -- Texte pour MAIRIE/BUREAU/COACH ; restera null pour CD17_LIGUE (fichier
  -- a la place, colonne ajoutee avec ce type dans une prochaine migration).
  body text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists club_reports_category_idx on public.club_reports (category, report_date desc);

alter table public.club_reports enable row level security;

-- Est-on coach d'au moins une equipe (peu importe laquelle) ? Meme principe
-- que is_team_coach(team_id) (20260731010000), mais sans cibler une equipe
-- precise -- necessaire ici puisque les comptes rendus Mairies/Bureau ne
-- sont rattaches a aucune equipe.
create or replace function public.is_any_coach()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.team_coaches where coach_id = auth.uid()
  );
$$;

-- Lecture : Bureau voit tout ; un coach voit Mairies/Bureau/CD17-Ligue (mais
-- CD17_LIGUE n'a encore aucune ligne possible, voir la policy d'ecriture
-- plus bas) et UNIQUEMENT ses propres comptes rendus COACH (retour explicite
-- de Cindy : "non, seulement le sien" -- jamais ceux des autres coachs).
create policy "read club reports"
  on public.club_reports for select
  using (
    public.is_club_admin()
    or (category in ('MAIRIE', 'BUREAU', 'CD17_LIGUE') and public.is_any_coach())
    or (category = 'COACH' and created_by = auth.uid())
  );

-- Ecriture (creation) : Bureau pour Mairies/Bureau ; un coach pour ses
-- propres comptes rendus (created_by force a lui-meme, jamais au nom d'un
-- autre coach). CD17_LIGUE : aucune branche ne correspond, donc bloque tant
-- que sa policy dediee (avec le dep0t de fichier) n'existe pas.
create policy "insert club reports"
  on public.club_reports for insert
  with check (
    (category in ('MAIRIE', 'BUREAU') and public.is_club_admin())
    or (category = 'COACH' and public.is_any_coach() and created_by = auth.uid())
  );

-- Modification : Bureau sur Mairies/Bureau ; l'auteur (ou le Bureau) sur un
-- compte rendu COACH. CD17_LIGUE deliberement absent ici : verrouille pour
-- toujours des sa creation, meme pour le Bureau (retour explicite de Cindy).
create policy "update club reports"
  on public.club_reports for update
  using (
    (category in ('MAIRIE', 'BUREAU') and public.is_club_admin())
    or (category = 'COACH' and (created_by = auth.uid() or public.is_club_admin()))
  )
  with check (
    (category in ('MAIRIE', 'BUREAU') and public.is_club_admin())
    or (category = 'COACH' and (created_by = auth.uid() or public.is_club_admin()))
  );

-- Suppression : memes droits que la modification (toujours rien pour
-- CD17_LIGUE).
create policy "delete club reports"
  on public.club_reports for delete
  using (
    (category in ('MAIRIE', 'BUREAU') and public.is_club_admin())
    or (category = 'COACH' and (created_by = auth.uid() or public.is_club_admin()))
  );

grant select, insert, update, delete on public.club_reports to authenticated;

alter publication supabase_realtime add table public.club_reports;
