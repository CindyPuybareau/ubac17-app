-- Retour de Cindy du 10/11 ("Événements à la une") : mise en avant
-- visuelle gérée par le Bureau, visible par tout le club, indépendante
-- du calendrier mais pouvant s'y rattacher optionnellement (ex.
-- Movember). Jamais de ciblage par équipe (décision explicite de
-- Cindy) -- même esprit que `teams` : lecture club entière, écriture
-- Bureau seul.
create table if not exists public.featured_highlights (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text,
  link_url text,
  -- Rattachement optionnel à un événement réel du calendrier (ex.
  -- Movember). on delete set null : si l'événement est un jour
  -- supprimé, l'affiche survit (jamais de perte en cascade, CLAUDE.md).
  event_id uuid references public.events(id) on delete set null,
  -- Disparaît de l'affichage passé cette date, sans être supprimée
  -- (le Bureau fait le ménage lui-même depuis l'écran de gestion).
  end_date date,
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.featured_highlights enable row level security;

drop policy if exists "select all featured_highlights" on public.featured_highlights;
create policy "select all featured_highlights"
  on public.featured_highlights for select
  using (true);

drop policy if exists "admin manage featured_highlights" on public.featured_highlights;
create policy "admin manage featured_highlights"
  on public.featured_highlights for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.featured_highlights to authenticated;

alter publication supabase_realtime add table public.featured_highlights;

insert into storage.buckets (id, name, public)
values ('featured-highlights', 'featured-highlights', true)
on conflict (id) do nothing;

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'image/gif']
where id = 'featured-highlights';

drop policy if exists "admin manage featured highlight images" on storage.objects;
create policy "admin manage featured highlight images"
  on storage.objects for all
  using (bucket_id = 'featured-highlights' and public.is_club_admin())
  with check (bucket_id = 'featured-highlights' and public.is_club_admin());

drop policy if exists "public read featured highlight images" on storage.objects;
create policy "public read featured highlight images"
  on storage.objects for select
  using (bucket_id = 'featured-highlights');
