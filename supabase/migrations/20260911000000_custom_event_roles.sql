-- Rôles d'organisation personnalisables ("Table de marque", "Arbitre de
-- touche"...) en plus des deux rôles historiques.
--
-- Jusqu'ici event_tasks.task_type était verrouillé par
-- check (task_type in ('JERSEYS','SNACKS')) : impossible d'en ajouter un
-- sans migration. On remplace ce verrou par une table de référence.
--
-- Portée : catalogue COMMUN au club (pas par équipe). C'est le choix le
-- plus simple qui répond au besoin, et il évite que chaque coach crée sa
-- variante de "Table de marque". event_types permet de restreindre un rôle
-- à certains types d'événement (une table de marque n'a pas de sens sur un
-- entraînement) ; un tableau vide signifie "tous les types".

create table if not exists public.event_role_types (
  code        text primary key,
  label       text not null,
  icon        text,                          -- nom d'icône Lucide (voir ROLE_ICONS)
  event_types text[] not null default '{}',  -- {} = tous les types d'événement
  sort_order  integer not null default 100,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Les deux rôles existants deviennent des lignes du catalogue, avec les
-- libellés déjà affichés dans l'app.
insert into public.event_role_types (code, label, icon, event_types, sort_order)
values
  ('JERSEYS', 'Lavage des maillots', 'Shirt', '{}', 10),
  ('SNACKS', 'Goûter d''après-match', 'Utensils', '{}', 20)
on conflict (code) do nothing;

-- Le verrou en dur laisse place à une clé étrangère : un rôle inconnu est
-- toujours rejeté, mais la liste des rôles valides devient une donnée.
alter table public.event_tasks
  drop constraint if exists event_tasks_task_type_check;

alter table public.event_tasks
  drop constraint if exists event_tasks_task_type_fkey;

alter table public.event_tasks
  add constraint event_tasks_task_type_fkey
  foreign key (task_type) references public.event_role_types(code);

alter table public.event_role_types enable row level security;

-- Lecture ouverte à tout compte connecté : le catalogue n'est pas une
-- donnée sensible, et les trois espaces (Bureau, Coach, Parent) l'affichent.
drop policy if exists "read event_role_types" on public.event_role_types;
create policy "read event_role_types"
  on public.event_role_types for select
  using (true);

-- Écriture réservée au Bureau et aux coachs : ce sont eux qui organisent
-- les matchs. is_coach_anywhere() est la fonction security definer déjà
-- utilisée ailleurs (20260903000000).
drop policy if exists "manage event_role_types" on public.event_role_types;
create policy "manage event_role_types"
  on public.event_role_types for all
  using (public.is_club_admin() or public.is_coach_anywhere())
  with check (public.is_club_admin() or public.is_coach_anywhere());

grant select, insert, update, delete on public.event_role_types to authenticated;

-- Realtime : un rôle ajouté par un coach doit apparaître chez les autres
-- sans F5, comme le reste du 360°.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'event_role_types'
  ) then
    alter publication supabase_realtime add table public.event_role_types;
  end if;
end $$;
