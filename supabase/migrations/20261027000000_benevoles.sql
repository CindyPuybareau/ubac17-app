-- Bénévoles hors club (retour de Cindy du 2026-08-25) : des personnes qui
-- aident le Bureau sur l'organisation d'un événement (buvette, table de
-- marque, installation...) sans être joueur, ni Bureau, ni forcément
-- parent d'un joueur du club. Table volontairement séparée de players :
-- jamais de lien avec les cotisations, l'effectif d'une équipe ou une
-- fiche joueur — juste un nom et un moyen de les contacter, comme demandé
-- explicitement ("pas les sous ça c'est sûr").
create table if not exists public.benevoles (
  id          uuid primary key default gen_random_uuid(),
  first_name  text not null,
  last_name   text not null,
  phone       text,
  email       text,
  notes       text,
  -- Jeton d'accès à usage de lien privé (voir plus bas) : contrairement à
  -- l'Espace Enfant (lien familial partagé + code à 4 chiffres, plusieurs
  -- enfants derrière un même lien), un bénévole est seul sur son lien —
  -- le jeton lui-même, suffisamment long pour être impossible à deviner,
  -- sert directement de clé d'accès, sans étape de code supplémentaire.
  access_token text not null unique default encode(gen_random_bytes(24), 'hex'),
  -- Soft-delete plutôt qu'une suppression définitive (même principe que
  -- players.archived_at) : un bénévole retiré du "Bureau" ne doit pas
  -- effacer son historique d'inscriptions passées (event_volunteer_signups
  -- référence benevoles en cascade — une suppression pure aurait aussi
  -- effacé "qui s'est occupé de quoi" sur les événements déjà passés).
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.benevoles enable row level security;

-- Même périmètre que sponsors/club_administrators : réservé au Bureau.
-- Un bénévole lui-même ne passe jamais par cette policy (aucune session
-- Supabase Auth — voir /api/benevole-signup, qui utilise le rôle service
-- et court-circuite la RLS après avoir vérifié son propre cookie de
-- session, même principe que l'Espace Enfant/child-session.ts).
create policy "admin manage benevoles"
  on public.benevoles
  for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.benevoles to authenticated;

-- Quels événements un bénévole donné doit voir — choisi par le Bureau à
-- la création/modification de l'événement ("Bénévoles invités"), même
-- principe que team_id/target_team_ids pour cibler des équipes.
create table if not exists public.event_benevole_invites (
  event_id    uuid not null references public.events(id) on delete cascade,
  benevole_id uuid not null references public.benevoles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, benevole_id)
);

alter table public.event_benevole_invites enable row level security;

create policy "admin manage event benevole invites"
  on public.event_benevole_invites
  for all
  using (public.is_club_admin())
  with check (public.is_club_admin());

grant select, insert, update, delete on public.event_benevole_invites to authenticated;

-- Un bénévole peut désormais couvrir un besoin d'organisation, en plus
-- d'un joueur/parent — player_id devient nullable, benevole_id nullable
-- ajouté en miroir, avec la garantie qu'une ligne porte l'un OU l'autre,
-- jamais aucun des deux ni les deux à la fois.
alter table public.event_volunteer_signups
  alter column player_id drop not null;

alter table public.event_volunteer_signups
  add column if not exists benevole_id uuid references public.benevoles(id) on delete cascade;

alter table public.event_volunteer_signups
  drop constraint if exists event_volunteer_signups_signer_check;
alter table public.event_volunteer_signups
  add constraint event_volunteer_signups_signer_check
  check ((player_id is not null) <> (benevole_id is not null));

-- unique(need_id, player_id) existant ne bloque pas les doublons côté
-- bénévole (NULL n'est jamais égal à NULL pour Postgres, donc plusieurs
-- lignes player_id=NULL ne se gênaient pas) — même garde-fou ajouté côté
-- benevole_id.
create unique index if not exists event_volunteer_signups_need_benevole_key
  on public.event_volunteer_signups (need_id, benevole_id)
  where benevole_id is not null;

-- Écriture réservée au rôle service désormais pour la branche bénévole
-- (aucune session Supabase Auth chez un bénévole) : la policy insert/delete
-- existante ("self or admin insert/delete volunteer signups") ne change
-- pas, elle ne s'applique de toute façon jamais à ces lignes-là — le rôle
-- service contourne la RLS, voir /api/benevole-signup.

-- Sync 360° (règle CLAUDE.md #4) : un bénévole ajouté/retiré, ou invité à
-- un événement, doit apparaître côté Bureau sans F5.
do $$
declare
  t text;
begin
  foreach t in array array['benevoles', 'event_benevole_invites']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
